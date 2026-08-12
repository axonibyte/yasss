/*
 * Copyright (c) 2026 CrowdEase, LLC.
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
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that lists polls.
 *
 * <p>Scoped or refused, never open. The rule is
 * {@link ListEventsEndpoint}'s and the reasoning is the same: an unscoped
 * listing is a directory of everything anybody has ever made, and a code is
 * meant to be the way in.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class ListPollsEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ListPollsEndpoint() {
    super("/polls", APIVersion.VERSION_1, HTTPMethod.GET);
  }

  /**
   * Whether this caller may see this listing.
   *
   * <p>Platform admins may list anything. Anybody else may list only their own
   * -- as organizer or as respondent -- and an unscoped listing stays
   * admin-only.
   *
   * @param auth the caller's {@link Authorization}
   * @param adminID the organizer scope, or {@code null}
   * @param respondentID the respondent scope, or {@code null}
   * @return {@code true} iff the listing may be served
   */
  static boolean mayList(Authorization auth, UUID adminID, UUID respondentID) {
    if(auth.atLeast(AccessLevel.ADMIN)) return true;
    if(null == auth.getActor()) return false;
    UUID self = auth.getActor().getID();
    // Both scopes must name the caller when both are given: scoping to your own
    // account and somebody else's respondent id would otherwise list the polls
    // they answered.
    if(null == adminID && null == respondentID) return false;
    if(null != adminID && !self.equals(adminID)) return false;
    if(null != respondentID && !self.equals(respondentID)) return false;
    return true;
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      JSONDeserializer deserializer = deserializeQueryParams(req)
          .tokenize("admin", false)
          .tokenize("respondent", false)
          .tokenize("label", false)
          .tokenize("page", false)
          .tokenize("limit", false)
          .check();

      UUID adminID = deserializer.has("admin") ? deserializer.getUUID("admin") : null;
      UUID respondentID = deserializer.has("respondent") ? deserializer.getUUID("respondent") : null;

      if(!mayList(auth, adminID, respondentID))
        throw new EndpointException(req, "access denied", 403);

      Integer page = deserializer.has("page")
          ? queryInt(req, deserializer, "page", MAX_PAGE)
          : null;
      Integer limit = deserializer.has("limit")
          ? queryInt(req, deserializer, "limit", MAX_PAGE_SIZE)
          : null;
      if(null != page && null == limit)
        throw new EndpointException(req, "missing argument (limit)", 400);

      String label = deserializer.has("label")
          ? '%' + deserializer.getString("label").strip() + '%'
          : null;

      JSONArray pollArr = new JSONArray();
      for(Poll poll : Poll.getPolls(adminID, respondentID, label, page, limit))
        pollArr.put(
            // The summary only. A listing that carried every column, row and
            // square of every poll would be the dashboard's whole payload, and
            // the dashboard shows a title and a date.
            new JSONObject()
                .put("id", poll.getID())
                .put("admin", poll.getAdmin())
                .put("shortDescription", poll.getShortDescription())
                .put("longDescription", poll.getLongDescription())
                .put("scope", poll.getScope())
                .put("code", poll.getCode())
                .put("isPublished", poll.isPublished())
                .put("closed", poll.isClosed())
                .put(
                    "responseDeadline",
                    null == poll.getResponseDeadline()
                        ? JSONObject.NULL
                        : Long.toString(poll.getResponseDeadline().getTime())));

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully retrieved polls")
          .put("polls", pollArr)
          .put("total", Poll.countPolls(adminID, respondentID, label));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
