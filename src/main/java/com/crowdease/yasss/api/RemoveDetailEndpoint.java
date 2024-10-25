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
import com.crowdease.yasss.model.Detail;
import com.crowdease.yasss.model.Event;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint responsible for handling the removal of details from events.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class RemoveDetailEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public RemoveDetailEndpoint() {
    super("/events/:event/details/:detail", APIVersion.VERSION_1, HTTPMethod.DELETE);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {

      Event event = null;
      Detail detail = null;

      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));

        if(null != event)
          detail = event.getDetail(
              UUID.fromString(
                  req.params("detail")));
        
      } catch(IllegalArgumentException e) { }

      if(null == detail)
        throw new EndpointException(req, "detail not found", 404);

      detail.delete();

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully deleted detail");
      
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
  
}
