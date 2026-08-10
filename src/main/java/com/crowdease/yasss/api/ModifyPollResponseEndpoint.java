/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
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
 * Endpoint that revises an answer somebody already gave.
 *
 * <p>Only where the organiser allowed it, and only by the person who gave it.
 * An account recognises itself; anybody else presents the token they were
 * handed when they answered. Neither the address nor the fingerprint authorises
 * anything here -- everybody behind one NAT shares an address, and an address
 * that could authorise an edit would let a stranger rewrite somebody else's
 * answer.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class ModifyPollResponseEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ModifyPollResponseEndpoint() {
    super("/polls/:poll/responses/:response", APIVersion.VERSION_1, HTTPMethod.PATCH);
  }

  /**
   * Whether this caller may act on this answer.
   *
   * @param auth the caller's {@link Authorization}
   * @param poll the {@link Poll}
   * @param response the {@link PollResponse}
   * @param token the edit token the caller presented, or {@code null}
   * @return {@code true} iff the caller may change or remove it
   */
  static boolean mayRevise(
      Authorization auth, Poll poll, PollResponse response, String token) {
    // The organiser may always act on answers to their own poll: it is their
    // poll, and they are the one who has to clear out a duplicate or a test
    // entry.
    if(auth.atLeast(poll)) return true;

    if(null != auth.getActor() && auth.getActor().getID().equals(response.getUser()))
      return true;

    if(null == token || null == response.getEditToken()) return false;
    try {
      return response.getEditToken().equals(UUID.fromString(token));
    } catch(IllegalArgumentException e) {
      return false;
    }
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.resolve(req);

      PollResponse response = null;
      try {
        response = poll.getResponse(UUID.fromString(req.params("response")));
      } catch(IllegalArgumentException e) { }

      if(null == response)
        throw new EndpointException(req, "response not found", 404);

      if(!mayRevise(auth, poll, response, req.queryParams("token")))
        throw new EndpointException(req, "access denied", 403);

      // Checked after ownership, so somebody else's answer reads as forbidden
      // rather than as an answer that merely arrived too late -- the second
      // would confirm the id names something.
      if(!poll.allowAnswerEdits() && !auth.atLeast(poll))
        throw new EndpointException(req, "this poll does not allow answers to be changed", 403);

      // Editing after the deadline is answering after the deadline.
      if(!auth.atLeast(AccessLevel.ADMIN) && poll.isClosed())
        throw new EndpointException(req, "poll closed", 412);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("name", false)
          .tokenize("votes", false)
          .tokenize("details", false)
          .check();

      if(deserializer.has("name")) {
        String name = bounded(req, deserializer.getString("name").strip(), "name");
        if(name.isBlank())
          throw new EndpointException(req, "malformed argument (string: name)", 400);
        response.setName(name);
      }

      // The same rules submitting uses. If revising accepted a square that
      // submitting refused, the way to cast an impossible vote would be to
      // submit a legal answer and immediately edit it.
      if(deserializer.has("votes")) {
        Set<UUID> votes = PollAnswers.votes(req, deserializer, poll);
        response.setVotes(votes);
      }

      if(deserializer.has("details")) {
        Map<PollDetail, String> details = PollAnswers.details(req, deserializer, poll);
        response.setDetails(details);
      }

      // The identity columns are deliberately left alone. Re-recording the
      // address or the fingerprint on every edit would turn a duplicate check
      // into a log of where somebody has been since.
      final PollResponse target = response;
      YasssCore.getDB().transaction(con -> {
        target.commit(con);
        PollVote.replaceWithin(con, target.getID(), target.getVotes());
        return null;
      });

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated response")
          .put("response", PollView.response(response, false));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
