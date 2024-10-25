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
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Activity;
import com.crowdease.yasss.model.Detail;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.Slot;
import com.crowdease.yasss.model.Window;
import com.crowdease.yasss.model.Detail.Type;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles the creation of events.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class CreateEventEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public CreateEventEndpoint() {
    super("/events", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
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
        .tokenize("details", true)
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
          new Timestamp(System.currentTimeMillis()),
          deserializer.has("emailOnSubmission")
              ? deserializer.getBool("emailOnSubmission")
              : false,
          deserializer.has("allowMultiUserSignups")
              ? deserializer.getBool("allowMultiUserSignups")
              : false,
          false);

      if(event.getShortDescription().isBlank())
        throw new EndpointException(req, "malformed argument (string: shortDescription)", 400);

      LinkedHashMap<Activity, List<JSONDeserializer>> activities = new LinkedHashMap<>();
      for(var activityDeserializer : deserializer.tokenizeJSONArray("activities", true)) {
        activityDeserializer
          .tokenize("shortDescription", true)
          .tokenize("longDescription", false)
          .tokenize("maxActivityVolunteers", false)
          .tokenize("maxSlotVolunteersDefault", false)
          .tokenize("priority", false)
          .tokenize("slots", false)
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
        
        if(0 > activity.getMaxActivityVolunteers() || 255 < activity.getMaxActivityVolunteers())
          throw new EndpointException(
              req,
              "malformed argument (int: activities[].maxActivityVolunteers)",
              400);
        
        if(0 > activity.getMaxSlotVolunteersDefault() || 255 < activity.getMaxSlotVolunteersDefault())
          throw new EndpointException(
              req,
              "malformed argument (int: activities[].maxSlotVolunteersDefault)",
              400);

        if(0 > activity.getPriority() || 255 < activity.getPriority())
          throw new EndpointException(
              req,
              "malformed argument (int: activities[].priority)",
              400);

        activities.put(
            activity,
            activityDeserializer.has("slots")
            ? activityDeserializer.tokenizeJSONArray("slots", true)
            : null);
      }

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

      List<Detail> details = new ArrayList<>();
      for(var detailDeserializer : deserializer.tokenizeJSONArray("details", true)) {
        detailDeserializer
          .tokenize("type", true)
          .tokenize("label", true)
          .tokenize("hint", false)
          .tokenize("priority", false)
          .tokenize("required", false)
          .check();

        Type type;
        try {
          type = Type.valueOf(
              detailDeserializer.getString("type").strip().toUpperCase());
        } catch(IllegalArgumentException e) {
          throw new EndpointException(req, "malformed argument (details[].type)", 400, e);
        }

        Detail detail = new Detail(
            null,
            null,
            type,
            detailDeserializer.getString("label").strip(),
            detailDeserializer.has("hint")
                ? detailDeserializer.getString("hint").strip()
                : "",
            detailDeserializer.has("priority")
                ? detailDeserializer.getInt("priority")
                : 0,
            detailDeserializer.has("required")
                ? detailDeserializer.getBool("required")
                : false);

        if(detail.getLabel().isBlank())
          throw new EndpointException(req, "malformed argument (details[].label)", 400);

        details.add(detail);
      }
      Collections.sort(details);

      TempSlot[][] slots = new TempSlot[activities.size()][windows.size()];
      int aIdx = 0;
      for(var activity : activities.entrySet()) {
        for(int sIdx = 0; sIdx < activity.getValue().size(); sIdx++) {
          var slotDeserializer = activity.getValue().get(sIdx)
            .tokenize("enabled", true)
            .tokenize("window", true)
            .tokenize("maxSlotVolunteers", false)
            .check();
          int wIdx = slotDeserializer.getInt("window");
          TempSlot tempSlot = new TempSlot();
          tempSlot.setEnabled(
              slotDeserializer.getBool("enabled"));
          if(tempSlot.isEnabled())
            tempSlot.setMaxSlotVolunteers(
                slotDeserializer.has("maxSlotVolunteers")
                ? slotDeserializer.getInt("maxSlotVolunteers")
                : activity.getKey().getMaxSlotVolunteersDefault());
          
          if(null != tempSlot.getMaxSlotVolunteers()
              && (0 > tempSlot.getMaxSlotVolunteers() || 255 < tempSlot.getMaxSlotVolunteers()))
            throw new EndpointException(
                req,
                "malformed argument (int: activities[].slots[].maxSlotVolunteers)",
                400);
          
          slots[aIdx][wIdx] = tempSlot;
        }
        aIdx++;
      }
      
      event.commit();
      for(var window : windows) {
        window.setEvent(event.getID());
        window.commit();
      }
      aIdx = 0;
      for(var activity : activities.entrySet()) {
        activity.getKey().setEvent(event.getID());
        activity.getKey().commit();

        int wIdx = 0;
        for(var window : windows) {
          Slot slot = new Slot(
              activity.getKey().getID(),
              window.getID(),
              activity.getKey().getMaxSlotVolunteersDefault());
          
          TempSlot tempSlot = slots[aIdx][wIdx];
          if(null != tempSlot && tempSlot.isEnabled()) { // specified vals
            if(null != tempSlot.getMaxSlotVolunteers()) // possibly update defaults
              slot.setMaxSlotVolunteers(
                  tempSlot.getMaxSlotVolunteers());
            slot.commit();
          } else if(null == tempSlot) { // default vals
            slot.commit();
          } // else assume tempSlot is explicitly disabled, don't commit it

          wIdx++;
        }
        aIdx++;
      }
      for(var detail : details) {
        detail.setEvent(event.getID());
        detail.commit();
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
                  (JSONArray)activities
                      .keySet()
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
                  (JSONArray)windows
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
                          }))
              .put(
                  "details",
                  (JSONArray)details
                      .stream()
                      .map(
                          d -> new JSONObject()
                              .put("id", d.getID())
                              .put("label", d.getLabel())
                              .put("hint", d.getHint())
                              .put("priority", d.getPriority())
                              .put("required", d.isRequired()))
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

  private static final class TempSlot {
    
    private boolean enabled;
    private Integer maxSlotVolunteers;

    private boolean isEnabled() {
      return enabled;
    }

    private void setEnabled(boolean enabled) {
      this.enabled = enabled;
    }

    private Integer getMaxSlotVolunteers() {
      return maxSlotVolunteers;
    }

    private void setMaxSlotVolunteers(Integer maxSlotVolunteers) {
      this.maxSlotVolunteers = maxSlotVolunteers;
    }
  }
  
}
