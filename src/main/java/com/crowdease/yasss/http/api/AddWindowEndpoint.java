/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.http.api;

import java.sql.SQLException;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.Window;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

public final class AddWindowEndpoint extends APIEndpoint {

  public AddWindowEndpoint() {
    super("/events/:event/windows", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {

      Event event = null;

      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));
      } catch(IllegalArgumentException e) { }

      if(null == event)
        throw new EndpointException(req, "event not found", 404);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
        .tokenize("beginTime", true)
        .tokenize("endTime", false)
        .check();

      Window window = new Window(
          null,
          event.getID(),
          deserializer.getTimestamp("beginTime"),
          deserializer.has("endTime")
              ? deserializer.getTimestamp("endTime")
              : null);

      if(null != window.getEndTime()) {
        if(window.getBeginTime().equals(window.getEndTime()))
          window.setEndTime(null);
        else if(window.getBeginTime().after(window.getEndTime()))
          throw new EndpointException(
              req,
              "malformed arguments (timestamp: beginTime, endTime)");
      }

      window.commit();

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created window")
          .put("window", new JSONObject()
              .put("id", window.getID())
              .put("beginTime", window.getBeginTime().getTime())
              .put(
                  "endTime",
                  null == window.getEndTime()
                      ? JSONObject.NULL
                      : window.getEndTime().getTime()));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
