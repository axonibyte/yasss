/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Fingerprint;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.PollDetail;
import com.crowdease.yasss.model.PollResponse;
import com.crowdease.yasss.model.PollVote;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that records one person's answer to a poll.
 *
 * <p>One row per submission, and no analogue of "add another volunteer": a poll
 * asks one person which times work for them, and that is the whole difference
 * between answering a poll and signing up for an event.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class AddPollResponseEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public AddPollResponseEndpoint() {
    super("/polls/:poll/responses", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.resolve(req);

      if(!poll.isPublished() && !auth.atLeast(poll))
        throw new EndpointException(req, "poll not found", 404);

      // The same admin exemption AddVolunteerEndpoint gives an expired event,
      // so staff can still repair a poll that has closed.
      if(!auth.atLeast(AccessLevel.ADMIN) && poll.isClosed())
        throw new EndpointException(req, "poll closed", 412);

      // The one result setting that constrains who may answer. Recognizing a
      // respondent across the gap between submitting and the deadline needs an
      // account: a token held in one browser is not an identity that survives a
      // new device or a cleared profile, so without this the poll would promise
      // results to people it could no longer recognize.
      if(poll.requiresAuthenticatedAnswers() && !auth.atLeast(Authorization.IS_AUTHENTICATED))
        throw new EndpointException(req, "this poll requires an account to answer", 403);

      // Anonymous callers pass a CAPTCHA, as they do to sign up for an event.
      if(!auth.atLeast(Authorization.IS_AUTHENTICATED) && !auth.atLeast(Authorization.IS_HUMAN))
        throw new EndpointException(req, "access denied", 403);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("name", true)
          .tokenize("votes", false)
          .tokenize("details", false)
          .tokenize("fingerprint", false)
          .check();

      String name = bounded(req, deserializer.getString("name").strip(), "name");
      if(name.isBlank())
        throw new EndpointException(req, "malformed argument (string: name)", 400);

      Set<UUID> votes = PollAnswers.votes(req, deserializer, poll);
      Map<PollDetail, String> details = PollAnswers.details(req, deserializer, poll);

      final UUID actorID = null == auth.getActor() ? null : auth.getActor().getID();
      final String actorIP = req.ip();

      // Rejected rather than ignored when it is not a digest: whatever survives
      // lands in a column that decides who gets turned away.
      final String rawFingerprint =
          deserializer.has("fingerprint") ? deserializer.getString("fingerprint") : null;
      // Blank is "no digest", which is legitimate; anything else that is not a
      // digest is a client sending something else entirely, and whatever
      // survived would land in a column that decides who gets turned away.
      if(null != rawFingerprint && !rawFingerprint.isBlank()
          && null == Fingerprint.parse(rawFingerprint))
        throw new EndpointException(req, "malformed argument (fingerprint)", 400);

      // Salted with the poll, so the same browser answering two polls stores two
      // unrelated values. Written whether or not it will be read -- see below.
      final byte[] fingerprint =
          Fingerprint.saltFor(poll.getID(), Fingerprint.parse(rawFingerprint));

      // The organizer is exempt, which is how somebody answers their own
      // single-answer poll.
      final boolean capped = !poll.allowMultiAnswers() && !auth.atLeast(poll);

      PollResponse response = new PollResponse(null, poll.getID(), actorID, name, actorIP)
          .setFingerprint(fingerprint)
          .setEditToken(UUID.randomUUID())
          .setSubmitted(new Timestamp(System.currentTimeMillis()))
          .setDetails(details)
          .setVotes(votes);

      try {
        YasssCore.getDB().transaction(con -> {
          con.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);

          if(capped) {
            // Locked before the count, and it must be the first lock taken.
            // The rule is a count followed by an insert, and nothing else holds
            // the gap: without this, simultaneous answers from one address all
            // count zero and all proceed.
            poll.lock(con);

            // WRITTEN ALWAYS, READ CONDITIONALLY, and that asymmetry is the
            // requirement rather than an oversight. A signed-in respondent is
            // matched on their account alone and is never turned away because
            // somebody else used this browser -- but their fingerprint is
            // recorded above regardless, so answering and then signing out does
            // not buy a second vote.
            if(1 <= PollAnswers.countExisting(poll, con, actorID, actorIP, fingerprint))
              throw new Poll.DuplicateResponseException();
          }

          response.commit(con);
          PollVote.replaceWithin(con, response.getID(), response.getVotes());
          return null;
        });
      } catch(Poll.DuplicateResponseException e) {
        throw new EndpointException(req, "already answered", 412);
      }

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully recorded response")
          // The token travels exactly once, here. It is the only thing an
          // anonymous respondent can present to prove the answer is theirs.
          .put("response", PollView.response(response, true));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
