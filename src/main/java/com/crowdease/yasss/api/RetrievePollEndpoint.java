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

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully retrieved poll")
          .put("poll", PollView.structure(poll));

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
