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
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles event modification.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class ModifyEventEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ModifyEventEndpoint() {
    super("/events/:event", APIVersion.VERSION_1, HTTPMethod.PATCH);
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
          .tokenize("admin", false)
          .tokenize("shortDescription", false)
          .tokenize("longDescription", false)
          .tokenize("emailOnSubmission", false)
          .tokenize("allowMultiUserSignups", false)
          .check();

      if(deserializer.has("admin"))
        event.setAdmin(
            deserializer.getUUID("admin"));

      if(deserializer.has("shortDescription")) {
        String shortDescription = deserializer.getString("shortDescription");
        if(shortDescription.isBlank())
          throw new EndpointException(req, "malformed argument (string: shortDescription)", 400);
        event.setShortDescription(shortDescription.strip());
      }

      if(deserializer.has("longDescription"))
        event.setLongDescription(
            deserializer.getString("longDescription").strip());

      if(deserializer.has("emailOnSubmission"))
        event.enableEmailOnSubmission(
            deserializer.getBool("emailOnSubmission"));

      if(deserializer.has("allowMultiUserSignups"))
        event.allowMultiUserSignups(
            deserializer.getBool("allowMultiUserSignups"));

      event.commit();

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated event")
          .put("event", new JSONObject()
              .put("id", event.getID())
              .put("admin", event.getAdmin())
              .put("shortDescription", event.getShortDescription())
              .put("longDescription", event.getLongDescription())
              .put("emailOnSubmission", event.emailOnSubmissionEnabled())
              .put("allowMultiUserSignups", event.allowMultiUserSignups()));
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
