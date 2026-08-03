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
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles the listing of endpoints.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class ListEventsEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ListEventsEndpoint() {
    super("/events", APIVersion.VERSION_1, HTTPMethod.GET);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      JSONDeserializer deserializer = deserializeQueryParams(req)
        .tokenize("admin", false)
        .tokenize("volunteer", false)
        .tokenize("label", false)
        .tokenize("earliest", false)
        .tokenize("latest", false)
        .tokenize("limit", false)
        .tokenize("page", false) // was read below but never registered, so any ?page= 400'd
        .check();

      if(deserializer.has("latest")
         && (deserializer.has("limit") || deserializer.has("page"))) {
        throw new EndpointException(req, "argument conflict (latest vs limit/page)", 400);
      }

      UUID adminID = deserializer.getUUID("admin");
      UUID volunteerID = deserializer.getUUID("volunteer");
      String labelSubstr = deserializer.getString("label");
      Timestamp earliest = deserializer.getTimestamp("earliest");
      Timestamp latest = deserializer.getTimestamp("latest");

      // Has to run after deserialization, so the scoping arguments are available.
      if(!mayList(auth, adminID, volunteerID))
        throw new EndpointException(req, "access denied", 403);

      Integer limit = 10; // skipped if `latest` is specified
      if(deserializer.has("limit")) {
        limit = queryInt(req, deserializer, "limit");
      }

      Integer page = 1; // skipped if `latest` is specified
      if(deserializer.has("page")) {
        page = queryInt(req, deserializer, "page");
      }

      int eventCount = Event.countEvents(adminID, volunteerID, labelSubstr, earliest);
      var events = null == latest
        ? Event.getEvents(adminID, volunteerID, labelSubstr, earliest, page, limit)
        : Event.getEvents(adminID, volunteerID, labelSubstr, earliest, latest);

      res.status(200);
      JSONObject resJSO = new JSONObject()
          .put("status", "ok")
          .put("info", "successfully retrieved events")
          .put(
              "events",
              (JSONArray)events
                  .stream()
                  .map(
                      e -> new JSONObject()
                          .put("id", e.getID())
                          .put("shortDescription", e.getShortDescription())
                          .put("isPublished", e.isPublished()))
                  .collect(
                      JSONArray::new,
                      JSONArray::put,
                      (a, b) -> {
                        for(final Object o : b) a.put(o);
                      }));
      if(null == latest && eventCount > page * limit)
        resJSO.put("next", page + 1);
      return resJSO;
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }

  /**
   * Determines whether a caller may list the events these arguments scope to.
   *
   * <p>An {@link AccessLevel#ADMIN} may list anything. Anyone else may list only
   * events scoped to their own account, which is what the logged-in dashboard
   * does and what an unconditional ADMIN check made impossible -- a normal user
   * listing their own events got a 403, and the client then read {@code events}
   * off {@code undefined}.
   *
   * <p>Note that an <em>unscoped</em> listing stays ADMIN-only. Widening this to
   * "anyone signed in" would turn the dashboard fix into a way to enumerate
   * every event on the platform.
   *
   * <p>Extracted so it is testable at all: the endpoint's own path needs a Spark
   * {@link Request} and a live database, and this is the part with teeth.
   *
   * @param auth the caller's {@link Authorization}
   * @param adminID the {@code admin} scope argument, or {@code null}
   * @param volunteerID the {@code volunteer} scope argument, or {@code null}
   * @return {@code true} if the listing is permitted
   */
  static boolean mayList(Authorization auth, UUID adminID, UUID volunteerID) {
    if(auth.atLeast(AccessLevel.ADMIN)) return true;

    // Guarded on the actor rather than on IS_AUTHENTICATED because atLeast
    // short-circuits to true when the signin requirement is disabled, which
    // would leave getActor() null.
    UUID self = null == auth.getActor() ? null : auth.getActor().getID();
    return null != self && (self.equals(adminID) || self.equals(volunteerID));
  }
}
