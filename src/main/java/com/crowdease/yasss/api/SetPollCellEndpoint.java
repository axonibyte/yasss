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
 * Endpoint that offers one square of a poll.
 *
 * <p>Idempotent: a square that is already offered stays offered, and says so
 * rather than colliding on the unique index. That matters because this is what
 * a grid click sends, and a double click is not an error.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class SetPollCellEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public SetPollCellEndpoint() {
    super("/polls/:poll/options/:option/windows/:window", APIVersion.VERSION_1, HTTPMethod.PUT);
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

      // An all-day column offers the whole day and nothing within it, so a
      // timed square there is a request that contradicts the column. Refused
      // rather than written and hidden: a row nothing renders is a row somebody
      // will eventually find and be puzzled by.
      if(option.isAllDay())
        throw new EndpointException(req, "that day is set to all day", 409);

      PollCell cell = PollCell.getCell(option.getID(), window.getID());
      if(null == cell) {
        cell = new PollCell(null, option.getID(), window.getID());
        cell.commit();
        res.status(201);
      }

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully set cell")
          .put("cell", PollView.cell(cell));

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
