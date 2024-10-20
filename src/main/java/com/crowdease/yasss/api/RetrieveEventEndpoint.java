/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.Volunteer;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

public final class RetrieveEventEndpoint extends APIEndpoint {

  public RetrieveEventEndpoint() {
    super("/events/:event", APIVersion.VERSION_1, HTTPMethod.GET);
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

      JSONArray activityArr = new JSONArray();
      JSONArray windowArr = new JSONArray();
      JSONArray volunteerArr = new JSONArray();
      JSONArray detailArr = new JSONArray();
      Map<UUID, Volunteer> volunteers = new HashMap<>();

      for(var activity : event.getActivities()) {
        JSONArray slotArr = new JSONArray();
        for(var slot : activity.getSlots()) {
          JSONArray rsvpArr = new JSONArray();
          for(var rsvp : slot.getRSPVs().entrySet()) {
            if(!volunteers.containsKey(rsvp.getValue().getID()))
              volunteers.put(
                  rsvp.getValue().getID(),
                  rsvp.getValue());
            rsvpArr.put(rsvp.getValue().getID());
          }
          slotArr.put(
              new JSONObject()
                  .put("window", slot.getWindow())
                  .put("maxSlotVolunteers", slot.getMaxSlotVolunteers())
                  .put("rsvps", rsvpArr)
                  .put("rsvpCount", rsvpArr.length()));
        }
        activityArr.put(
            new JSONObject()
                .put("id", activity.getID())
                .put("shortDescription", activity.getShortDescription())
                .put("longDescription", activity.getLongDescription())
                .put("maxActivityVolunteers", activity.getMaxActivityVolunteers())
                .put("maxSlotVolunteersDefault", activity.getMaxSlotVolunteersDefault())
                .put("priority", activity.getPriority())
                .put("slots", slotArr));
      }

      for(var window : event.getWindows())
        windowArr.put(
            new JSONObject()
                .put("id", window.getID())
                .put("begin", window.getBeginTime().getTime())
                .put(
                    "end",
                    null != window.getEndTime()
                        ? window.getEndTime().getTime()
                        : JSONObject.NULL));

      for(var detail : event.getDetails())
        detailArr.put(
            new JSONObject()
                .put("id", detail.getID())
                .put("type", detail.getType())
                .put("label", detail.getLabel())
                .put("hint", detail.getHint())
                .put("priority", detail.getPriority())
                .put("required", detail.isRequired()));

      for(var volunteer : volunteers.values())
        volunteerArr.put(
            new JSONObject()
                .put("id", volunteer.getID())
                .put("name", volunteer.getName())
                .put(
                    "details",
                    (JSONArray)volunteer.getDetails()
                        .entrySet()
                        .stream()
                        .map(
                            d -> new JSONObject()
                                .put("detail", d.getKey().getID())
                                .put("value", d.getValue()))
                        .collect(
                            JSONArray::new,
                            JSONArray::put,
                            (a, b) -> {
                              for(final Object o : b) a.put(o);
                            })));

      res.status(200);
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
             .put("activities", activityArr)
             .put("windows", windowArr)
             .put("details", detailArr)
             .put("volunteers", volunteerArr));

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
