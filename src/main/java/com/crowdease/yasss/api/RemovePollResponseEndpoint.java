/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.PollResponse;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that withdraws an answer.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class RemovePollResponseEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public RemovePollResponseEndpoint() {
    super("/polls/:poll/responses/:response", APIVersion.VERSION_1, HTTPMethod.DELETE);
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

      if(!ModifyPollResponseEndpoint.mayRevise(auth, poll, response, req.queryParams("token")))
        throw new EndpointException(req, "access denied", 403);

      // Withdrawing an answer is governed by the same setting as changing one:
      // deleting and re-submitting is a way to change an answer, and a poll
      // that forbids the second must forbid the first or the setting means
      // nothing. The organizer is exempt, as they are everywhere else.
      if(!poll.allowAnswerEdits() && !auth.atLeast(poll))
        throw new EndpointException(req, "this poll does not allow answers to be changed", 403);

      if(!auth.atLeast(AccessLevel.ADMIN) && poll.isClosed())
        throw new EndpointException(req, "poll closed", 412);

      // Its votes and its answers go with it, by cascade.
      response.delete();

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully deleted response");

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
