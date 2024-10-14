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
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

public final class AddActivityEndpoint extends APIEndpoint {

  public AddActivityEndpoint() {
    super("/events/:event/activities", APIVersion.VERSION_1, HTTPMethod.POST);
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
          .tokenize("shortDescription", true)
          .tokenize("longDescription", false)
          .tokenize("maxActivityVolunteers", false)
          .tokenize("maxSlotVolunteersDefault", false)
          .tokenize("priority", false)
          .check();

      Activity activity = new Activity(
          null,
          event.getID(),
          deserializer.getString("shortDescription").strip(),
          deserializer.has("longDescription")
              ? deserializer.getString("longDescription")
              : "",
          deserializer.has("maxActivityVolunteers")
              ? deserializer.getInt("maxActivityVolunteers")
              : 0,
          deserializer.has("maxSlotVolunteersDefault")
              ? deserializer.getInt("maxSlotVolunteersDefault")
              : 0,
          deserializer.has("priority")
              ? deserializer.getInt("priority")
              : 0);

      if(activity.getShortDescription().isBlank())
        throw new EndpointException(
            req,
            "malformed argument (string: shortDescription)",
            400);

      if(0 > activity.getMaxActivityVolunteers() || 255 < activity.getMaxActivityVolunteers())
        throw new EndpointException(
            req,
            "malformed argument (int: maxActivityVolunteers)",
            400);

      if(0 > activity.getMaxSlotVolunteersDefault() || 255 < activity.getMaxSlotVolunteersDefault())
        throw new EndpointException(
            req,
            "malformed argument (int: maxSlotVolunteerDefault)",
            400);

      if(0 > activity.getPriority() || 255 < activity.getPriority())
        throw new EndpointException(
            req,
            "malformed argument (int: priority)",
            400);

      activity.commit();

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created activity")
          .put("activity", new JSONObject()
              .put("id", activity.getID())
              .put("shortDescription", activity.getShortDescription())
              .put("longDescription", activity.getLongDescription())
              .put("maxActivityVolunteers", activity.getMaxActivityVolunteers())
              .put("maxSlotVolunteersDefault", activity.getMaxSlotVolunteersDefault())
              .put("priority", activity.getPriority()));
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
