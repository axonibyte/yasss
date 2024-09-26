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

import com.axonibyte.lib.auth.CryptoException;
import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Detail;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

public final class ModifyUserEndpoint extends APIEndpoint {

  public ModifyUserEndpoint() {
    super("/users/:user", APIVersion.VERSION_1, HTTPMethod.PATCH);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      User user = null;

      try {
        user = User.getUser(
            UUID.fromString(
                req.params("user")));
      } catch(IllegalArgumentException e) { }

      if(null == user)
        throw new EndpointException(req, "user not found", 404);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
        .tokenize("email", false)
        .tokenize("accessLevel", false)
        .tokenize("pubkey", false)
        .tokenize("regenerateMFA", false)
        .check();

      if(deserializer.has("accessLevel")) {
        // TODO auth check
        try {
          user.setAccessLevel(
              AccessLevel.valueOf(
                  deserializer.getString("accessLevel")));
        } catch(IllegalArgumentException e) {
          throw new EndpointException(req, "malformed argument (accessLevel)", 400, e);
        }
      }
      
      boolean emailChanged = false;
      if(deserializer.has("email")) {
        final String email = deserializer.getString("email").strip();
        if(email.isBlank() || !Detail.Type.EMAIL.isValid(email))
          throw new EndpointException(req, "malformed argument (email)", 400);
        if((emailChanged = !user.getEmail().equalsIgnoreCase(email))
            && null != User.getUser(email))
          throw new EndpointException(req, "conflicting email address found", 409);

        // TODO if auth'd user is an admin, use #setEmail instead
        user.setPendingEmail(email);
      }

      if(deserializer.has("pubkey")) {
        try {
          user.setPubkey(
              deserializer.getString("pubkey").strip());
        } catch(CryptoException e) {
          throw new EndpointException(req, "malformed argument (pubkey)", 400, e);
        }
      }

      JSONObject userJSO = new JSONObject()
          .put("id", user.getID())
          .put("email", user.getEmail())
          .put("accessLevel", user.getAccessLevel());

      if(deserializer.has("regenerateMFA") && deserializer.getBool("regenerateMFA")) {
        try {
          userJSO.put("mfaSecret", user.regenerateMFAKey());
        } catch(CryptoException e) {
          throw new EndpointException(req, "mfa generation malfunction", 500);
        }
      }
      
      if(AccessLevel.ADMIN != user.getAccessLevel() && emailChanged) {
        // TODO fire off verification email
      }

      user.commit();

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created user")
          .put("user", userJSO);
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
