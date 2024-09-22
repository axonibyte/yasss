/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.http.api;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Activity;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.Slot;
import com.crowdease.yasss.model.Window;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

public class CreateEventEndpoint extends APIEndpoint {

  protected CreateEventEndpoint() {
    super("/events", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      JSONDeserializer deserializer = new JSONDeserializer(req.body())
        .tokenize("admin", false)
        .tokenize("shortDescription", true)
        .tokenize("longDescription", false)
        .tokenize("emailOnSubmission", false)
        .tokenize("allowMultiUserSignups", false)
        .tokenize("activities", true)
        .tokenize("windows", true)
        .check();

      Event event = new Event(
          null,
          deserializer.has("admin")
              ? deserializer.getUUID("admin")
              : null,
          deserializer.getString("shortDescription").strip(),
          deserializer.has("longDescription")
              ? deserializer.getString("longDescription").strip()
              : "",
          System.currentTimeMillis(),
          deserializer.has("emailOnSubmission")
              ? deserializer.getBool("emailOnSubmission")
              : false,
          deserializer.has("allowMultiUserSignups")
              ? deserializer.getBool("allowMultiUserSignups")
              : false,
          false);

      if(event.getShortDescription().isBlank())
        throw new EndpointException(req, "malformed argument (string: shortDescription)", 400);

      List<Activity> activities = new ArrayList<>();
      for(var activityDeserializer : deserializer.tokenizeJSONArray("activities", true)) {
        activityDeserializer
          .tokenize("shortDescription", true)
          .tokenize("longDescription", false)
          .tokenize("maxActivityVolunteers", false)
          .tokenize("maxSlotVolunteersDefault", false)
          .tokenize("priority", false)
          .check();
        
        Activity activity = new Activity(
            null,
            null,
            activityDeserializer.getString("shortDescription").strip(),
            activityDeserializer.has("longDescription")
                ? activityDeserializer.getString("longDescription")
                : "",
            activityDeserializer.has("maxActivityVolunteers")
                ? activityDeserializer.getInt("maxActivityVolunteers")
                : 0,
            activityDeserializer.has("maxSlotVolunteersDefault")
                ? activityDeserializer.getInt("maxSlotVolunteersDefault")
                : 0,
            activityDeserializer.has("priority")
                ? activityDeserializer.getInt("priority")
                : 0);

        if(activity.getShortDescription().isBlank())
          throw new EndpointException(
              req,
              "malformed argument (string: activities[].shortDescription)",
              400);
        
        if(0 > activity.getMaxActivityVolunteers())
          throw new EndpointException(
              req,
              "malformed argument (int: activities[].maxActivityVolunteers)",
              400);
        
        if(0 > activity.getMaxSlotVolunteersDefault())
          throw new EndpointException(
              req,
              "malformed argument (int: activities[].maxSlotVolunteersDefault)",
              400);

        activities.add(activity);
      }
      Collections.sort(activities);

      List<Window> windows = new ArrayList<>();
      for(var windowDeserializer : deserializer.tokenizeJSONArray("windows", true)) {
        windowDeserializer
          .tokenize("beginTime", true)
          .tokenize("endTime", false)
          .check();

        Window window = new Window(
            null,
            null,
            windowDeserializer.getTimestamp("beginTime"),
            windowDeserializer.has("endTime")
                ? windowDeserializer.getTimestamp("endTime")
                : null);

        if(null != window.getEndTime()) {
          if(window.getBeginTime().equals(window.getEndTime()))
             window.setEndTime(null);
          else if(window.getBeginTime().after(window.getEndTime()))
            throw new EndpointException(
                req,
                "malformed arguments (timestamp: activities[] | beginTime, endTime)");
        }

        windows.add(window);
      }
      Collections.sort(windows);
      
      event.commit();
      for(var window : windows) {
        window.setEvent(event.getID());
        window.commit();
      }
      for(var activity : activities) {
        activity.setEvent(event.getID());
        activity.commit();

        for(var window : windows) {
          Slot slot = new Slot(
              activity.getID(),
              window.getID(),
              activity.getMaxSlotVolunteersDefault());
          slot.commit();
        }
      }

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created event")
          .put("event", new JSONObject()
              .put("id", event.getID())
              .put("admin", event.getAdmin())
              .put("shortDescription", event.getShortDescription())
              .put("longDescription", event.getLongDescription())
              .put("emailOnSubmission", event.emailOnSubmissionEnabled())
              .put("allowMultiUserSignups", event.allowMultiUserSignups())
              .put(
                  "activities",
                  activities
                      .stream()
                      .map(
                          a -> new JSONObject()
                              .put("id", a.getID())
                              .put("shortDescription", a.getShortDescription())
                              .put("longDescription", a.getLongDescription())
                              .put("maxActivityVolunteers", a.getMaxActivityVolunteers())
                              .put("maxSlotVolunteersDefault", a.getMaxSlotVolunteersDefault())
                              .put("priority", a.getPriority()))
                      .collect(
                          JSONArray::new,
                          JSONArray::put,
                          (a, b) -> {
                            for(final Object o : b) a.put(o);
                          }))
              .put(
                  "windows",
                  windows
                      .stream()
                      .map(
                          w -> new JSONObject()
                              .put("id", w.getID())
                              .put("beginTime", w.getBeginTime().getTime())
                              .put(
                                  "endTime",
                                  null == w.getEndTime()
                                      ? JSONObject.NULL
                                      : w.getEndTime().getTime()))
                      .collect(
                          JSONArray::new,
                          JSONArray::put,
                          (a, b) -> {
                            for(final Object o : b) a.put(o);
                          })));
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
