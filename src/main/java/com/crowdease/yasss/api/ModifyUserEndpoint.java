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
import java.util.UUID;

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
 * Handles user modification.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class ModifyUserEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ModifyUserEndpoint() {
    super("/users/:user", APIVersion.VERSION_1, HTTPMethod.PATCH);
  }

  /**
   * {@inheritDoc}
   */
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

      if(!auth.atLeast(user))
        throw new EndpointException(req, "access denied", 403);

      if(deserializer.has("accessLevel")) {
        if(!auth.atLeast(AccessLevel.ADMIN))
          throw new EndpointException(req, "access denied", 403);
        
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

        if(auth.atLeast(AccessLevel.ADMIN))
          user.setEmail(email);
        else user.setPendingEmail(email);
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
            "email-change",
            args);
        mail.send();
      }

      user.commit();

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated user")
          .put("user", userJSO);
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(CryptoException e) {
      throw new EndpointException(req, "cryptographic malfunction", 500, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
