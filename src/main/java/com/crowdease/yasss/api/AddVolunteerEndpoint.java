/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Detail;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.Volunteer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

public final class AddVolunteerEndpoint extends APIEndpoint {

  public AddVolunteerEndpoint() {
    super("/events/:event/volunteers", APIVersion.VERSION_1, HTTPMethod.POST);
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
        .tokenize("remindersEnabled", false)
        .tokenize("details", true)
        .tokenize("user", false)
        .check();

      User user = null;
      if(deserializer.has("user")) {
        try {
          user = User.getUser(
              UUID.fromString(
                  req.params("user")));
        } catch(IllegalArgumentException e) { }
        
        if(null == user)
          throw new EndpointException(req, "user not found", 404);
      }

      Volunteer volunteer = new Volunteer(
          null,
          user.getID(),
          event.getID(),
          deserializer.has("remindersEnabled")
              ? deserializer.getBool("remindersEnabled")
              : false);
      Map<UUID, Detail> fields = event.getDetails()
          .stream()
          .collect(
              Collectors.toMap(
                  e -> e.getID(),
                  e -> e,
                  (a, b) -> a,
                  LinkedHashMap::new));
      
      Map<Detail, String> details = new LinkedHashMap<>();
      for(var detailDeserializer : deserializer.tokenizeJSONArray("details", true)) {
        detailDeserializer
            .tokenize("detail", true)
            .tokenize("value", true)
            .check();
        UUID detailID = detailDeserializer.getUUID("detail");
        if(!fields.containsKey(detailID))
          throw new EndpointException(req, "detail not found", 404);
        Detail detail = fields.get(detailID);
        String value = detailDeserializer.getString("value").strip();
        if(!detail.isValid(value))
          throw new EndpointException(req, "malformed argument (details[].value)", 400);
        details.put(
            fields.get(detailID),
            detailDeserializer.getString("value"));
      }

      for(var field : fields.values())
        if(field.isRequired() && !details.containsKey(field))
          throw new EndpointException(req, "missing required detail", 400);
      
      volunteer.setDetails(details);

      volunteer.commit();

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully added volunteer")
          .put("volunteer", new JSONObject()
              .put("id", volunteer.getID())
              .put("user", volunteer.getUser())
              .put("event", volunteer.getEvent())
              .put(
                  "details",
                  (JSONArray)details.entrySet()
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

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
