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

/**
 * Endpoint that handles activity modification.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class ModifyActivityEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ModifyActivityEndpoint() {
    super("/events/:event/activities/:activity", APIVersion.VERSION_1, HTTPMethod.PATCH);
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

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("shortDescription", false)
          .tokenize("longDescription", false)
          .tokenize("maxActivityVolunteers", false)
          .tokenize("maxSlotVolunteersDefault", false)
          .tokenize("priority", false)
          .check();

      if(deserializer.has("shortDescription")) {
        activity.setShortDescription(
            deserializer.getString("shortDescription").strip());
        if(activity.getShortDescription().isBlank())
          throw new EndpointException(
              req,
              "malformed argument (string: shortDescription)",
              400);
      }
      
      if(deserializer.has("longDescription"))
        activity.setLongDescription(
            deserializer.getString("longDescription").strip());
      
      if(deserializer.has("maxActivityVolunteers")) {
        activity.setMaxActivityVolunteers(
            deserializer.getInt("maxActivityVolunteers"));
        if(0 > activity.getMaxActivityVolunteers()
            || 255 < activity.getMaxActivityVolunteers())
          throw new EndpointException(
              req,
              "malformed argument (int: maxActivityVolunteers)",
              400);
      }
      
      if(deserializer.has("maxSlotVolunteersDefault")) {
        activity.setMaxSlotVolunteersDefault(
            deserializer.getInt("maxSlotVolunteersDefault"));
        if(0 > activity.getMaxSlotVolunteersDefault()
           || 255 < activity.getMaxActivityVolunteers())
          throw new EndpointException(
              req,
              "malformed argument (int: maxSlotVolunteerDefault)",
              400);
      }
      
      if(deserializer.has("priority")) {
        activity.setPriority(
            deserializer.getInt("priority"));
        if(0 > activity.getPriority() || 255 < activity.getPriority())
          throw new EndpointException(
              req,
              "malformed argument (int: priority)",
              400);
      }
      
      activity.commit();

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated activity")
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
