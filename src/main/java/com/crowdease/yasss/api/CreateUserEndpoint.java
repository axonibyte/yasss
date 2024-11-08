/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

import com.axonibyte.lib.auth.CryptoException;
import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Detail;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.Mail;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles the creation of users.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class CreateUserEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public CreateUserEndpoint() {
    super("/users", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      JSONDeserializer deserializer = new JSONDeserializer(req.body())
        .tokenize("email", true)
        .tokenize("accessLevel", false)
        .tokenize("pubkey", false)
        .tokenize("generateMFA", false)
        .check();

      final AccessLevel accessLevel;
      if(0 == User.countUsers(null))
        accessLevel = AccessLevel.ADMIN;
      else if(deserializer.has("accessLevel")) {
        try {
          accessLevel = AccessLevel.valueOf(
              deserializer.getString("accessLevel"));
        } catch(IllegalArgumentException e) {
          throw new EndpointException(req, "malformed argument (accessLevel)", 400, e);
        }
      } else accessLevel = AccessLevel.UNVERIFIED;

      if(!auth.atLeast(Authorization.IS_HUMAN) && !auth.atLeast(AccessLevel.ADMIN))
        throw new EndpointException(req, "access denied", 403);

      final String email = deserializer.getString("email").strip();
      if(email.isBlank() || !Detail.Type.EMAIL.isValid(email))
        throw new EndpointException(req, "malformed argument (email)", 400);
      if(null != User.getUser(email))
        throw new EndpointException(req, "conflicting email address found", 409);

      final User user;
      try {
        user = new User(
            AccessLevel.UNVERIFIED == accessLevel ? email : null,
            accessLevel,
            deserializer.getString("pubkey"));
        if(AccessLevel.UNVERIFIED != accessLevel)
          user.setEmail(email);
      } catch(CryptoException e) {
        throw new EndpointException(req, "malformed argument (pubkey)", 400);
      }

      JSONObject userJSO = new JSONObject()
          .put("email", email)
          .put("accessLevel", accessLevel);
      
      if(deserializer.has("generateMFA") && deserializer.getBool("generateMFA")) {
        try {
          userJSO.put("mfaSecret", user.regenerateMFAKey());
        } catch(CryptoException e) {
          throw new EndpointException(req, "mfa generation malfunction", 500);
        }
      }

      user.commit();

      if(AccessLevel.UNVERIFIED == user.getAccessLevel()) {
        Map<String, String> args = new HashMap<>();
        args.put(
            "VERIFY_LINK",
            String.format(
                "%1$s?action=verify-user&user=%2$s&token=%3$s",
                YasssCore.getAPIHost(),
                user.getID().toString(),
                YasssCore.getTicketEngine().sign(
                    user.getID().toString())));

        Mail mail = new Mail(
            user.getPendingEmail(),
            "welcome",
            args);
        mail.send();
      }

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created user")
          .put("user", userJSO.put("id", user.getID()));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(CryptoException e) {
      throw new EndpointException(req, "cryptographic malfunction", 500, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
