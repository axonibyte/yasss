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
import com.crowdease.yasss.model.Detail;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.Detail.Type;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles the adding of a detail to an endpoint.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class AddDetailEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public AddDetailEndpoint() {
    super("/events/:event/details", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
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

      if(!auth.atLeast(event))
        throw new EndpointException(req, "access denied", 403);

      if(!auth.atLeast(AccessLevel.ADMIN) && event.isExpired())
        throw new EndpointException(req, "event expired", 412);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
        .tokenize("type", true)
        .tokenize("label", true)
        .tokenize("hint", false)
        .tokenize("priority", false)
        .tokenize("required", false)
        .check();

      Type type;
      try {
        type = Type.valueOf(
            deserializer.getString("type").strip().toUpperCase());
      } catch(IllegalArgumentException e) {
        throw new EndpointException(req, "malformed argument (type)", 400, e);
      }

      Detail detail = new Detail(
          null,
          event.getID(),
          type,
          bounded(req, deserializer.getString("label").strip(), "label"),
          deserializer.has("hint")
              ? bounded(req, deserializer.getString("hint").strip(), "hint")
              : "",
          deserializer.has("priority")
              ? deserializer.getInt("priority")
              : 0,
          deserializer.has("required")
              ? deserializer.getBool("required")
              : false);

      if(detail.getLabel().isBlank())
        throw new EndpointException(req, "malformed argument (label)", 400);

      // Mirrors the 0-255 bound the activity endpoints enforce. Without it an
      // out-of-range value reaches a TINYINT UNSIGNED column and becomes a
      // database error and a 500 -- a client mistake reported as a server fault.
      if(0 > detail.getPriority() || 255 < detail.getPriority())
        throw new EndpointException(req, "malformed argument (int: priority)", 400);

      detail.commit();

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created detail")
          .put("detail", new JSONObject()
              .put("id", detail.getID())
              .put("type", detail.getType())
              .put("label", detail.getLabel())
              .put("hint", detail.getHint())
              .put("priority", detail.getPriority())
              .put("required", detail.isRequired()));
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
