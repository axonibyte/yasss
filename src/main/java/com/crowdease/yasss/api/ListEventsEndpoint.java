/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles the listing of endpoints.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class ListEventsEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ListEventsEndpoint() {
    super("/events", APIVersion.VERSION_1, HTTPMethod.GET);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    if(!auth.atLeast(AccessLevel.ADMIN))
      throw new EndpointException(req, "access denied", 403);
    
    try {
      JSONDeserializer deserializer = deserializeQueryParams(req)
        .tokenize("admin", false)
        .tokenize("volunteer", false)
        .tokenize("label", false)
        .tokenize("earliest", false)
        .tokenize("latest", false)
        .tokenize("limit", false)
        .check();

      if(deserializer.has("latest")
         && (deserializer.has("limit") || deserializer.has("page"))) {
        throw new EndpointException(req, "argument conflict (latest vs limit/page)", 400);
      }

      UUID adminID = deserializer.getUUID("admin");
      UUID volunteerID = deserializer.getUUID("volunteer");
      String labelSubstr = deserializer.getString("label");
      Timestamp earliest = deserializer.getTimestamp("earliest");
      Timestamp latest = deserializer.getTimestamp("latest");
      
      Integer limit = 10; // skipped if `latest` is specified
      if(deserializer.has("limit")) {
        limit = deserializer.getInt("limit");
        if(1 > limit)
          throw new EndpointException(req, "malformed argument (limit)", 400);
      }

      Integer page = 1; // skipped if `latest` is specified
      if(deserializer.has("page")) {
        page = deserializer.getInt("page");
        if(1 > page)
          throw new EndpointException(req, "malformed argument (page)", 400);
      }

      int eventCount = Event.countEvents(adminID, volunteerID, labelSubstr, earliest);
      var events = null == latest
        ? Event.getEvents(adminID, volunteerID, labelSubstr, earliest, page, limit)
        : Event.getEvents(adminID, volunteerID, labelSubstr, earliest, latest);

      res.status(200);
      JSONObject resJSO = new JSONObject()
          .put("status", "ok")
          .put("info", "successfully retrieved events")
          .put(
              "events",
              (JSONArray)events
                  .stream()
                  .map(
                      e -> new JSONObject()
                          .put("id", e.getID())
                          .put("shortDescription", e.getShortDescription())
                          .put("isPublished", e.isPublished()))
                  .collect(
                      JSONArray::new,
                      JSONArray::put,
                      (a, b) -> {
                        for(final Object o : b) a.put(o);
                      }));
      if(null == latest && eventCount > page * limit)
        resJSO.put("next", page + 1);
      return resJSO;
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
