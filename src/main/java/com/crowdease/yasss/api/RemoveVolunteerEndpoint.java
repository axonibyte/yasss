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
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.Volunteer;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint responsible for handling the removal of volunteers from events.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class RemoveVolunteerEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public RemoveVolunteerEndpoint() {
    super("/events/:event/volunteers/:volunteer", APIVersion.VERSION_1, HTTPMethod.DELETE);
  }

  /**
   * {@inheritDoc}
   */
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

      if(!auth.atLeast(User.getUser(volunteer.getUser()))
          && !auth.atLeast(event))
        throw new EndpointException(req, "access denied", 403);
      
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
