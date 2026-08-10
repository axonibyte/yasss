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
import com.crowdease.yasss.model.PollCell;
import com.crowdease.yasss.model.PollOption;
import com.crowdease.yasss.model.PollWindow;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that withdraws one square of a poll.
 *
 * <p>Idempotent, like its counterpart: withdrawing a square that is not offered
 * is not an error, because the caller wanted it gone and it is.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class UnsetPollCellEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public UnsetPollCellEndpoint() {
    super("/polls/:poll/options/:option/windows/:window", APIVersion.VERSION_1, HTTPMethod.DELETE);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.editable(req, auth);

      PollOption option = null;
      PollWindow window = null;
      try {
        option = poll.getOption(UUID.fromString(req.params("option")));
        window = poll.getWindow(UUID.fromString(req.params("window")));
      } catch(IllegalArgumentException e) { }

      if(null == option)
        throw new EndpointException(req, "option not found", 404);
      if(null == window)
        throw new EndpointException(req, "window not found", 404);

      PollCell cell = PollCell.getCell(option.getID(), window.getID());
      // Every vote on it goes too, by cascade -- nobody is left on record as
      // having chosen a time that is no longer offered.
      if(null != cell) cell.delete();

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully unset cell");

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
