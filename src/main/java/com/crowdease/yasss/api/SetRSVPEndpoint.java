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
import com.crowdease.yasss.model.RSVP;
import com.crowdease.yasss.model.Slot;
import com.crowdease.yasss.model.Volunteer;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

public final class SetRSVPEndpoint extends APIEndpoint {

  public SetRSVPEndpoint() {
    super(
        "/events/:event/activities/:activity/windows/:window/volunteers/:volunteer",
        APIVersion.VERSION_1,
        HTTPMethod.PUT);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {

      Event event = null;
      Activity activity = null;
      Slot slot = null;
      Volunteer volunteer = null;
      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));

        if(null != event) {
          activity = event.getActivity(
              UUID.fromString(
                  req.params("activity")));
          volunteer = event.getVolunteer(
              UUID.fromString(
                  req.params("volunteer")));
        }

        if(null != activity)
          slot = activity.getSlot(
              UUID.fromString(
                  req.params("window")));
        
      } catch(IllegalArgumentException e) { }
      
      if(null == slot)
        throw new EndpointException(req, "slot not found", 404);

      if(0 != activity.getMaxActivityVolunteers()
          && activity.getMaxActivityVolunteers() <= activity.countRSVPs()
          || 0 != slot.getMaxSlotVolunteers()
          && slot.getMaxSlotVolunteers() <= slot.countRSVPs())
        throw new EndpointException(req, "volunteer cap exceeded", 409);

      RSVP rsvp = new RSVP(activity.getID(), slot.getWindow(), volunteer.getID());
      rsvp.commit();

      res.status(201);
      return new JSONObject()
        .put("status", "ok")
        .put("info", "successfully set rsvp")
        .put("rsvp", new JSONObject()
             .put("activity", rsvp.getActivity())
             .put("window", rsvp.getWindow())
             .put("volunteer", rsvp.getVolunteer()));

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
