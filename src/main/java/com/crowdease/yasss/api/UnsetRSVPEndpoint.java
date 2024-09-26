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
import java.util.Map.Entry;

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

public final class UnsetRSVPEndpoint extends APIEndpoint {

  public UnsetRSVPEndpoint() {
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
      Entry<RSVP, Volunteer> rsvp = null;
      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));

        if(null != event)
          activity = event.getActivity(
              UUID.fromString(
                  req.params("activity")));

        if(null != activity)
          slot = activity.getSlot(
              UUID.fromString(
                  req.params("window")));

        if(null != slot)
          rsvp = slot.getRSVP(
              UUID.fromString(
                  req.params("volunteer")));
        
      } catch(IllegalArgumentException e) { }

      if(null == rsvp)
        throw new EndpointException(req, "rsvp not found", 404);

      rsvp.getKey().delete();

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully unset rsvp");
      
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
