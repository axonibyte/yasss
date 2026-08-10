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
import com.crowdease.yasss.model.PollOption;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that removes a column from a poll.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class RemovePollOptionEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public RemovePollOptionEndpoint() {
    super("/polls/:poll/options/:option", APIVersion.VERSION_1, HTTPMethod.DELETE);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.editable(req, auth);

      PollOption option = null;
      try {
        option = poll.getOption(UUID.fromString(req.params("option")));
      } catch(IllegalArgumentException e) { }

      if(null == option)
        throw new EndpointException(req, "option not found", 404);

      // Its squares and every vote cast on them go with it, by cascade. That is
      // the intended reading of withdrawing a day: nobody is left on record as
      // having chosen a time that is no longer offered.
      option.delete();

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully deleted option");

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
