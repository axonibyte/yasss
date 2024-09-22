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
import com.crowdease.yasss.model.Activity;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.Slot;
import com.crowdease.yasss.model.Window;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

public class SetSlotEndpoint extends APIEndpoint {

  protected SetSlotEndpoint() {
    super(
        "/events/:event/activities/:activity/windows/:window",
        APIVersion.VERSION_1,
        HTTPMethod.PUT);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {

      Event event = null;
      Activity activity = null;
      Window window = null;
      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));
        activity = Activity.getActivity(
            UUID.fromString(
                req.params("activity")));
        window = Window.getWindow(
            UUID.fromString(
                req.params("window")));
      } catch(IllegalArgumentException e) { }

      if(null == event || null == activity || 0 != event.getID().compareTo(activity.getEvent()))
        throw new EndpointException(req, "activity not found", 404);
      else if(null == window || 0 != event.getID().compareTo(window.getEvent()))
        throw new EndpointException(req, "window not found", 404);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
        .tokenize("maxSlotVolunteers", false)
        .check();

      Slot slot = new Slot(
          activity.getID(),
          window.getID(),
          deserializer.has("maxSlotVolunteers")
              ? deserializer.getInt("maxSlotVolunteers")
              : activity.getMaxSlotVolunteersDefault());

      slot.commit();

      res.status(201);
      return new JSONObject()
        .put("status", "ok")
        .put("info", "successfully set slot")
        .put("slot", new JSONObject()
             .put("activity", activity.getID())
             .put("window", window.getID())
             .put("maxSlotVolunteers", slot.getMaxSlotVolunteers()));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
      
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
