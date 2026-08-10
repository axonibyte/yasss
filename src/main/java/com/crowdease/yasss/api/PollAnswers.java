/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.http.rest.EndpointException;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.PollCell;
import com.crowdease.yasss.model.PollDetail;
import com.crowdease.yasss.model.PollOption;
import com.crowdease.yasss.model.PollResponse;

import spark.Request;

/**
 * What an answer is allowed to say, shared by submitting one and revising one.
 *
 * <p>Both endpoints have to agree exactly. If revising an answer accepted a
 * square that submitting one refused, the way to cast an impossible vote would
 * be to submit a legal answer and immediately edit it.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
final class PollAnswers {

  private PollAnswers() { }

  /**
   * The squares that may actually be voted for.
   *
   * <p>Not simply every square the poll owns. An all-day column offers the
   * whole day <em>instead of</em> the times within it, so while that flag is
   * set its timed squares still exist -- they are kept so unsetting the flag
   * restores the column -- but they are not on offer, and a vote for one would
   * be a vote for something nobody was shown.
   *
   * @param poll the {@link Poll}
   * @return the ids of the squares currently on offer
   * @throws SQLException if a database malfunction occurs
   */
  static Set<UUID> votable(Poll poll) throws SQLException {
    Map<UUID, PollOption> options = new LinkedHashMap<>();
    for(PollOption option : poll.getOptions()) options.put(option.getID(), option);

    Set<UUID> open = new LinkedHashSet<>();
    for(PollCell cell : poll.getCells()) {
      PollOption option = options.get(cell.getOption());
      if(null == option) continue;
      if(option.isAllDay() == cell.isAllDay()) open.add(cell.getID());
    }
    return open;
  }

  /**
   * Reads the {@code votes} array, checking every square is on offer.
   *
   * @param req the {@link Request}
   * @param deserializer the request body
   * @param poll the {@link Poll} being answered
   * @return the chosen square ids
   * @throws EndpointException 400 on a malformed id, 404 on one this poll does
   *         not offer
   * @throws DeserializationException if the array is not one
   * @throws SQLException if a database malfunction occurs
   */
  static Set<UUID> votes(Request req, JSONDeserializer deserializer, Poll poll)
      throws EndpointException, DeserializationException, SQLException {
    Set<UUID> chosen = new LinkedHashSet<>();
    if(!deserializer.has("votes")) return chosen;

    Set<UUID> open = votable(poll);
    for(Object raw : deserializer.getJSONArray("votes")) {
      UUID cellID;
      try {
        cellID = UUID.fromString(String.valueOf(raw));
      } catch(IllegalArgumentException e) {
        throw new EndpointException(req, "malformed argument (votes[])", 400);
      }
      // 404 rather than 403: a square belonging to somebody else's poll and a
      // square that does not exist are the same thing from here, and saying
      // which would confirm that an id names something.
      if(!open.contains(cellID))
        throw new EndpointException(req, "cell not found", 404);
      chosen.add(cellID);
    }
    return chosen;
  }

  /**
   * Reads the {@code details} array against the poll's questions.
   *
   * <p>Every required question must be answered, and every answer must suit its
   * type -- both checked here rather than at the column, because
   * {@code VARCHAR(255)} has no opinion about whether a string is an email
   * address.
   *
   * @param req the {@link Request}
   * @param deserializer the request body
   * @param poll the {@link Poll} being answered
   * @return the answers, by question
   * @throws EndpointException 400 on a missing or unsuitable answer, 404 on a
   *         question this poll does not ask
   * @throws DeserializationException if the array is not one
   * @throws SQLException if a database malfunction occurs
   */
  static Map<PollDetail, String> details(Request req, JSONDeserializer deserializer, Poll poll)
      throws EndpointException, DeserializationException, SQLException {
    Map<UUID, PollDetail> questions = new LinkedHashMap<>();
    for(PollDetail question : poll.getDetails()) questions.put(question.getID(), question);

    Map<PollDetail, String> answers = new LinkedHashMap<>();
    if(deserializer.has("details"))
      for(var answerDeserializer : deserializer.tokenizeJSONArray("details", true)) {
        answerDeserializer
            .tokenize("detail", true)
            .tokenize("value", true)
            .check();

        PollDetail question = questions.get(answerDeserializer.getUUID("detail"));
        if(null == question)
          throw new EndpointException(req, "detail not found", 404);

        String value = question.getType().normalize(answerDeserializer.getString("value").strip());
        if(!question.isValid(value))
          throw new EndpointException(
              req,
              "malformed argument (details[" + question.getID() + "].value)",
              400);

        answers.put(question, APIEndpoint.bounded(req, value, "details[].value"));
      }

    for(PollDetail question : questions.values())
      if(question.isRequired() && !answers.containsKey(question))
        throw new EndpointException(
            req,
            "missing argument (details[" + question.getID() + "].value)",
            400);

    return answers;
  }

  /**
   * Counts the answers already on record for whoever is asking.
   *
   * <p>The asymmetry lives here, in one named place, so that it can be stated
   * once and tested directly. A signed-in caller is matched on their account
   * and <em>only</em> their account: they are never turned away because
   * somebody else used this browser or shares this office's address. Everybody
   * else is matched on the address or the fingerprint -- either is enough,
   * because requiring both would mean any change of network defeats the check.
   *
   * <p>Note what is not here: the fingerprint is still <em>written</em> for a
   * signed-in respondent, by the caller, before this runs. That is what makes
   * answering and then signing out fail to buy a second vote. Skipping the
   * write when authenticated is the obvious optimisation and it would quietly
   * remove half the feature.
   *
   * @param poll the {@link Poll} being answered
   * @param con the {@link Connection} running the transaction
   * @param actorID the signed-in account, or {@code null}
   * @param ipAddr the address the answer arrived from
   * @param fingerprint the salted browser fingerprint, or {@code null}
   * @return how many answers this identity already has
   * @throws SQLException if a database malfunction occurs
   */
  static int countExisting(
      Poll poll, java.sql.Connection con, UUID actorID, String ipAddr, byte[] fingerprint)
      throws SQLException {
    return null != actorID
        ? poll.countResponses(con, actorID, null, null)
        : poll.countResponses(con, null, ipAddr, fingerprint);
  }

  /**
   * The caller's own answer, if they have one.
   *
   * @param poll the {@link Poll}
   * @param auth the caller's {@link Authorization}
   * @param token the edit token the caller presented, or {@code null}
   * @return the {@link PollResponse}, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  static PollResponse ownResponse(Poll poll, Authorization auth, String token)
      throws SQLException {
    UUID actorID = null == auth.getActor() ? null : auth.getActor().getID();
    UUID presented = null;
    if(null != token) {
      try {
        presented = UUID.fromString(token);
      } catch(IllegalArgumentException e) {
        // A token that is not a token is simply not a match.
      }
    }
    if(null == actorID && null == presented) return null;

    for(PollResponse response : poll.getResponses()) {
      if(null != actorID && actorID.equals(response.getUser())) return response;
      if(null != presented && presented.equals(response.getEditToken())) return response;
    }
    return null;
  }

  /**
   * Whether a caller has already answered this poll.
   *
   * <p>What the "once you have answered" result settings turn on. An account
   * recognises itself; anybody else has to present the token they were handed,
   * because a browser fingerprint is evidence of a duplicate and not proof of
   * identity -- it is shared by every visitor with the same phone.
   *
   * @param poll the {@link Poll}
   * @param auth the caller's {@link Authorization}
   * @param token the edit token the caller presented, or {@code null}
   * @return {@code true} iff this caller has an answer on record
   * @throws SQLException if a database malfunction occurs
   */
  static boolean hasResponded(Poll poll, Authorization auth, String token) throws SQLException {
    return null != ownResponse(poll, auth, token);
  }
}
