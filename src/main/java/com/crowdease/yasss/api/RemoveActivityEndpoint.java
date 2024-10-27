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
import com.crowdease.yasss.model.Activity;
import com.crowdease.yasss.model.Event;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint responsible for handling the removal of event activities.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class RemoveActivityEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public RemoveActivityEndpoint() {
    super("/events/:event/activities/:activity", APIVersion.VERSION_1, HTTPMethod.DELETE);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {      
      Event event = null;
      Activity activity = null;
      
      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));

        if(null != event) {
          if(!auth.atLeast(event))
            throw new EndpointException(req, "access denied", 403);
          
          activity = event.getActivity(
              UUID.fromString(
                  req.params("activity")));
        }
        
      } catch(IllegalArgumentException e) { }

      if(null == activity)
        throw new EndpointException(req, "activity not found", 404);

      activity.delete();

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully deleted activity");
      
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
