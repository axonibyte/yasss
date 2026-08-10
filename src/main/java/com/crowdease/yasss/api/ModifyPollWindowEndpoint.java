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
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.PollWindow;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that changes a row of a poll.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class ModifyPollWindowEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ModifyPollWindowEndpoint() {
    super("/polls/:poll/windows/:window", APIVersion.VERSION_1, HTTPMethod.PATCH);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.editable(req, auth);

      PollWindow window = null;
      try {
        window = poll.getWindow(UUID.fromString(req.params("window")));
      } catch(IllegalArgumentException e) { }

      if(null == window)
        throw new EndpointException(req, "window not found", 404);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("startTime", false)
          .tokenize("appliesToNewOptions", false)
          .check();

      if(deserializer.has("startTime"))
        window.setStartTime(validTime(req, deserializer.getString("startTime"), "startTime"));

      if(deserializer.has("appliesToNewOptions"))
        window.setAppliesToNewOptions(deserializer.getBool("appliesToNewOptions"));

      try {
        window.commit();
      } catch(SQLException e) {
        if(1062 == e.getErrorCode())
          throw new EndpointException(req, "that time is already on this poll", 409, e);
        throw e;
      }

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated window")
          .put("window", PollView.window(window));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
