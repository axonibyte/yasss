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
import com.crowdease.yasss.model.Slot;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

public final class UnsetSlotEndpoint extends APIEndpoint {

  public UnsetSlotEndpoint() {
    super(
        "/events/:event/activities/:activity/windows/:window",
        APIVersion.VERSION_1,
        HTTPMethod.DELETE);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {

      Event event = null;
      Activity activity = null;
      Slot slot = null;
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
        
      } catch(IllegalArgumentException e) { }

      if(null == slot)
        throw new EndpointException(req, "slot not found", 404);

      slot.delete();

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully unset slot");

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
