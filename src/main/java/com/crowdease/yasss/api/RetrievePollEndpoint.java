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
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.PollResponse;
import com.crowdease.yasss.model.PollTally;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that serves a poll to whoever holds its link or its code.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public final class RetrievePollEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public RetrievePollEndpoint() {
    super("/polls/:poll", APIVersion.VERSION_1, HTTPMethod.GET);
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

      // Publicly readable once published, which is the whole point of the
      // short code. An unpublished poll is not reachable at all today -- polls
      // are published the moment they are created -- but the check is here
      // rather than assumed, because the column exists and the day it stops
      // always being true should not be the day this endpoint starts leaking.
      if(!poll.isPublished() && !auth.atLeast(poll))
        throw new EndpointException(req, "poll not found", 404);

      JSONObject body = PollView.structure(poll);

      // Whether the caller is the organiser, and whether they have answered.
      // The second is an account or the token they were handed -- never the
      // address or the fingerprint, which are evidence of a duplicate and not
      // proof of identity.
      final boolean owner = auth.atLeast(poll);
      final String token = req.queryParams("token");
      final boolean responded = PollAnswers.hasResponded(poll, auth, token);

      // Omitted from the payload rather than hidden by the client. A tally the
      // browser is trusted not to render is a tally anybody can read with
      // developer tools open, which is not a setting -- it is a suggestion.
      if(poll.tallyVisibleTo(owner, responded))
        body.put(
            "tally",
            PollView.tally(PollTally.counts(poll.getID()), PollTally.respondents(poll.getID())));

      // The organiser gets the answers themselves, which is the poll's whole
      // point for them: a tally says half the group can make Tuesday, and the
      // list says which half.
      if(owner) {
        JSONArray responseArr = new JSONArray();
        for(PollResponse response : poll.getResponses())
          responseArr.put(PollView.response(response, false));
        body.put("responses", responseArr);
      }

      // Anybody may always read back their own answer, whatever the result
      // setting says: it is theirs, and they are the one who wrote it.
      PollResponse own = PollAnswers.ownResponse(poll, auth, token);
      if(null != own && !owner)
        body.put("yourResponse", PollView.response(own, false));

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully retrieved poll")
          .put("poll", body);

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
