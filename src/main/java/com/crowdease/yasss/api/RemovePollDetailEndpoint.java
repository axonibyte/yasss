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
import com.crowdease.yasss.model.PollDetail;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that removes a custom question from a poll.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class RemovePollDetailEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public RemovePollDetailEndpoint() {
    super("/polls/:poll/details/:detail", APIVersion.VERSION_1, HTTPMethod.DELETE);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.editable(req, auth);

      PollDetail detail = null;
      try {
        detail = poll.getDetail(UUID.fromString(req.params("detail")));
      } catch(IllegalArgumentException e) { }

      if(null == detail)
        throw new EndpointException(req, "detail not found", 404);

      // Every answer already given to this question goes with it, by cascade.
      detail.delete();

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully deleted detail");

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
