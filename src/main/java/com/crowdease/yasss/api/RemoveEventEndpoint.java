/*
 * Copyright (c) 2024 CrowdEase, LLC.
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
import com.crowdease.yasss.model.Event;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

public final class RemoveEventEndpoint extends APIEndpoint {

  public RemoveEventEndpoint() {
    super("/events/:event", APIVersion.VERSION_1, HTTPMethod.DELETE);
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
      
      event.delete();
      
      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully deleted event");
      
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
