/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.User;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles changes to a poll's own settings.
 *
 * <p>Its columns, rows, questions and squares each have their own endpoints;
 * this is the summary, and the options that govern how it is answered and who
 * sees the result.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class ModifyPollEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ModifyPollEndpoint() {
    super("/polls/:poll", APIVersion.VERSION_1, HTTPMethod.PATCH);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = null;

      try {
        poll = resolvePoll(req.params("poll"));
      } catch(IllegalArgumentException e) { }

      if(null == poll)
        throw new EndpointException(req, "poll not found", 404);

      if(!auth.atLeast(poll))
        throw new EndpointException(req, "access denied", 403);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("admin", false)
          .tokenize("shortDescription", false)
          .tokenize("longDescription", false)
          .tokenize("timeMode", false)
          .tokenize("timezone", false)
          .tokenize("responseDeadline", false)
          .tokenize("allowMultiAnswers", false)
          .tokenize("allowAnswerEdits", false)
          .tokenize("resultVisibility", false)
          .check();

      // Scope is absent by design and cannot be patched. Changing it would make
      // every existing column invalid -- a weekday poll's columns hold no dates
      // and an absolute poll's hold no weekdays -- so the honest way to change
      // your mind is a new poll, not a request that silently discards the grid
      // and every vote already cast on it.

      if(deserializer.has("admin")) {
        User user = User.getUser(deserializer.getUUID("admin"));
        if(null == user)
          throw new EndpointException(req, "user not found", 404);
        if(!auth.atLeast(user))
          throw new EndpointException(req, "access denied", 403);
        poll.setAdmin(user.getID());
      }

      if(deserializer.has("shortDescription")) {
        poll.setShortDescription(
            bounded(req, deserializer.getString("shortDescription").strip(), "shortDescription"));
        if(poll.getShortDescription().isBlank())
          throw new EndpointException(req, "malformed argument (string: shortDescription)", 400);
      }

      if(deserializer.has("longDescription"))
        poll.setLongDescription(
            bounded(req, deserializer.getString("longDescription").strip(), "longDescription"));

      if(deserializer.has("timeMode"))
        poll.setTimeMode(
            enumOf(req, Poll.TimeMode.class, deserializer.getString("timeMode"), "timeMode"));

      // An explicit null clears the zone, which is how a poll moves from zoned
      // back to wall clock in one request. Without it the two settings could
      // only ever be changed in an order that PollRules rejects halfway.
      if(deserializer.has("timezone"))
        poll.setTimezone(
            deserializer.getData().isNull("timezone")
                ? null
                : validTimezone(req, deserializer.getString("timezone").strip()));

      // Likewise: an explicit null removes the deadline and reopens the poll.
      if(deserializer.has("responseDeadline"))
        poll.setResponseDeadline(
            deserializer.getData().isNull("responseDeadline")
                ? null
                : deserializer.getTimestamp("responseDeadline"));

      if(deserializer.has("allowMultiAnswers"))
        poll.allowMultiAnswers(deserializer.getBool("allowMultiAnswers"));

      if(deserializer.has("allowAnswerEdits"))
        poll.allowAnswerEdits(deserializer.getBool("allowAnswerEdits"));

      if(deserializer.has("resultVisibility"))
        poll.setResultVisibility(
            enumOf(
                req,
                Poll.ResultVisibility.class,
                deserializer.getString("resultVisibility"),
                "resultVisibility"));

      // The same combination check creation makes. Enforced on one and not the
      // other would mean anybody could reach a forbidden state by making the
      // poll and then editing it.
      PollRules.validate(req, poll);

      poll.commit();

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated poll")
          .put("poll", PollView.structure(poll));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
