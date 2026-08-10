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
 * Endpoint that handles the deletion of a poll.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class RemovePollEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public RemovePollEndpoint() {
    super("/polls/:poll", APIVersion.VERSION_1, HTTPMethod.DELETE);
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

      // Every answer goes with it, by cascade -- including every stored
      // fingerprint, which is what makes "we keep it only as long as the poll"
      // a property of the schema rather than a promise.
      poll.delete();

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully deleted poll");

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
