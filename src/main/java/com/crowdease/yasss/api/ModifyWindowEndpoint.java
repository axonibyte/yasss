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
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;
import com.crowdease.yasss.model.Window;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint responsible for modifying event windows.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class ModifyWindowEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ModifyWindowEndpoint() {
    super("/events/:event/windows/:window", APIVersion.VERSION_1, HTTPMethod.PATCH);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {

      Event event = null;
      Window window = null;
      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));

        if(null != event) {
          if(!auth.atLeast(event))
            throw new EndpointException(req, "access denied", 403);

          if(!auth.atLeast(AccessLevel.ADMIN) && event.isExpired())
            throw new EndpointException(req, "event expired", 412);
          
          window = event.getWindow(
              UUID.fromString(
                  req.params("window")));
        }
        
      } catch(IllegalArgumentException e) { }

      if(null == window)
        throw new EndpointException(req, "window not found", 404);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("beginTime", false)
          .tokenize("endTime", false)
          .check();

      if(deserializer.has("beginTime"))
        window.setBeginTime(
            deserializer.getTimestamp("beginTime"));

      if(deserializer.has("endTime"))
        window.setEndTime(
            JSONObject.NULL == deserializer.get("endTime")
                ? null
                : deserializer.getTimestamp("endTime"));

      if(null != window.getEndTime()) {
        if(window.getBeginTime().equals(window.getEndTime()))
          window.setEndTime(null);
        else if(window.getBeginTime().after(window.getEndTime()))
          throw new EndpointException(
              req,
              "malformed arguments (timestamp: beginTime, endTime)");
      }

      window.commit();

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated window")
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
