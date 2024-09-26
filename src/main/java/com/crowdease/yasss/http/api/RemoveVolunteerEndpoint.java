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
import com.crowdease.yasss.model.Volunteer;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

public final class RemoveVolunteerEndpoint extends APIEndpoint {

  public RemoveVolunteerEndpoint() {
    super("/events/:event/volunteers/:volunteer", APIVersion.VERSION_1, HTTPMethod.DELETE);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {

      Event event = null;
      Volunteer volunteer = null;
      
      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));

        if(null != event)
          volunteer = event.getVolunteer(
              UUID.fromString(
                  req.params("volunteer")));
        
      } catch(IllegalArgumentException e) { }
      
      if(null == volunteer)
        throw new EndpointException(req, "volunteer not found", 404);
      
      volunteer.delete();
      
      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully deleted volunteer");
      
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
