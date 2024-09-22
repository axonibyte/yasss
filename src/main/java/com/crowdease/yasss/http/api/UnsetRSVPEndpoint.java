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
import com.crowdease.yasss.model.RSVP;
import com.crowdease.yasss.model.Slot;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

public class UnsetRSVPEndpoint extends APIEndpoint {

  protected UnsetRSVPEndpoint() {
    super(
        "/events/:event/activities/:activity/windows/:window/volunteers/:volunteer",
        APIVersion.VERSION_1,
        HTTPMethod.DELETE);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {

      Event event = null;
      Activity activity = null;
      Slot slot = null;
      RSVP rsvp = null;
      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));
        activity = Activity.getActivity(
            UUID.fromString(
                req.params("activity")));
        slot = null == activity
            ? null
            : activity.getSlot(
                UUID.fromString(
                    req.params("window")));
        rsvp = null == slot
            ? null
            : slot.getRSVP(
                UUID.fromString(
                    req.params("volunteer")));
      } catch(IllegalArgumentException e) { }
      
      if(null == event || null == activity || null == slot || null == rsvp
          || 0 != event.getID().compareTo(activity.getEvent()))
        throw new EndpointException(req, "rsvp not found", 404);

      rsvp.delete();

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully unset rsvp");
      
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
