/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

public final class ListUsersEndpoint extends APIEndpoint {

  public ListUsersEndpoint() {
    super("/users", APIVersion.VERSION_1, HTTPMethod.GET);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      JSONDeserializer deserializer = deserializeQueryParams(req)
          .tokenize("accessLevel", false)
          .tokenize("page", false)
          .tokenize("limit", false)
          .check();

      AccessLevel accessLevel = null;
      if(deserializer.has("accessLevel")) {
        try {
          accessLevel = AccessLevel.valueOf(
              deserializer.getString("accessLevel"));
        } catch(IllegalArgumentException e) {
          throw new EndpointException(req, "malformed argument (accessLevel)", 400, e);
        }
      }

      Integer page = deserializer.has("page") ? deserializer.getInt("page") : 1;
      if(1 > page)
        throw new EndpointException(req, "malformed argument (page)", 400);

      Integer limit = deserializer.has("limit") ? deserializer.getInt("limit") : 10;
      if(1 > limit)
        throw new EndpointException(req, "malformed argument (limit)", 400);

      int userCount = User.countUsers(accessLevel);
      var users = User.getUsers(accessLevel, page, limit);

      res.status(200);
      JSONObject resJSO = new JSONObject()
          .put("status", "ok")
          .put("info", "successfully retrieved users")
          .put(
              "users",
              (JSONArray)users
                  .stream()
                  .map(
                      u -> new JSONObject()
                          .put("id", u.getID())
                          .put("email", u.getEmail())
                          .put("accessLevel", u.getAccessLevel()))
                  .collect(
                      JSONArray::new,
                      JSONArray::put,
                      (a, b) -> {
                        for(final Object o : b) a.put(o);
                      }));
      if(userCount > page * limit)
        resJSO.put("next", page + 1);
      return resJSO;

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
