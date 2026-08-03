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

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.Mail;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint responsible for verifying a user.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class VerifyUserEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public VerifyUserEndpoint() {
    super("/users/:user", APIVersion.VERSION_1, HTTPMethod.PUT);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    if(!auth.is(Authorization.IS_HUMAN) && !auth.is(AccessLevel.ADMIN))
      throw new EndpointException(req, "access denied", 403);
    
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
        .tokenize("token", false)
        .check();

      if(!deserializer.has("token")) {

        if(null == user.getPendingEmail())
          throw new EndpointException(req, "user has no pending email", 409);

        // A fresh token per send, so an older email cannot verify an address
        // the user has since corrected.
        user.setVerifyToken(UUID.randomUUID());
        user.commit();

        sendVerificationMail(user);

        res.status(202);
        return new JSONObject()
          .put("status", "ok")
          .put("info", "resent verification request");
        
      } else if(!tokenMatches(user, deserializer.getString("token"))) {
        throw new EndpointException(req, "access denied", 403);
      }
      
      switch(user.getAccessLevel()) {
      
      case BANNED:
        throw new EndpointException(req, "access denied", 403);
      
      case UNVERIFIED:
        user.setEmail(user.getPendingEmail());
        user.setPendingEmail(null);
        // Single-use: the link cannot be replayed to re-verify a later address.
        user.setVerifyToken(null);
        // Promotion is the entire point of verifying, and it was missing.
        // Confirming the address populated `email` -- which is what
        // authentication resolves against, so the user could suddenly log in --
        // but left the access level at UNVERIFIED, so every endpoint gated on
        // atLeast(STANDARD) still refused them. A self-registered user could
        // therefore never create an event without an ADMIN promoting them by
        // hand, and nothing anywhere said so.
        user.setAccessLevel(AccessLevel.STANDARD);
        user.commit();
        
        res.status(200);
        return new JSONObject()
            .put("status", "ok")
            .put("info", "user successfully verified");
      
      default:
        res.status(200);
        return new JSONObject()
            .put("status", "ok")
            .put("info", "user already verified");
      
      }
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }

  /**
   * Compares a supplied token against the one stored for a user.
   *
   * <p>A user with no outstanding verification matches nothing, which is what
   * stops a cleared token from being replayed.
   *
   * @param user the {@link User}
   * @param supplied the token from the request
   * @return {@code true} if they match
   */
  static boolean tokenMatches(User user, String supplied) {
    if(null == user.getVerifyToken() || null == supplied) return false;
    try {
      return user.getVerifyToken().equals(UUID.fromString(supplied));
    } catch(IllegalArgumentException e) {
      // Indistinguishable from a wrong token, on purpose.
      return false;
    }
  }

  /**
   * Sends the welcome mail carrying a user's verification link.
   *
   * <p>Call only after the user has been committed: the link quotes the stored
   * token, and mailing one that a later failure rolls back gives the recipient
   * a link that can never work.
   *
   * @param user the {@link User}, already committed
   */
  static void sendVerificationMail(User user) {
    Map<String, String> args = new HashMap<>();
    args.put(
        "VERIFY_LINK",
        String.format(
            "%1$s?action=verify-user&user=%2$s&token=%3$s",
            YasssCore.getAPIHost(),
            user.getID().toString(),
            user.getVerifyToken()));

    new Mail(user.getPendingEmail(), "welcome", args).send();
  }

}
