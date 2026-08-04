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
import com.crowdease.yasss.model.ExpiringToken;
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
        mintVerifyToken(user);
        user.commit();

        sendVerificationMail(user);

        res.status(202);
        return new JSONObject()
          .put("status", "ok")
          .put("info", "resent verification request");

      } else {
        switch(ExpiringToken.check(
            user.getVerifyToken(),
            user.getVerifyTokenExpires(),
            deserializer.getString("token"),
            System.currentTimeMillis())) {

        case NO_MATCH:
          throw new EndpointException(req, "access denied", 403);

        case EXPIRED:
          // 410 rather than 403, and reachable only on a token that matches --
          // so it cannot be used to ask whether a given account has one
          // outstanding. The distinction is worth drawing because the remedy
          // differs: a 403 means the link is not yours, a 410 means it was and
          // you need another.
          throw new EndpointException(req, "verification link has expired", 410);

        default:
          break;
        }
      }

      switch(user.getAccessLevel()) {
      
      case BANNED:
        throw new EndpointException(req, "access denied", 403);
      
      case UNVERIFIED:
        user.setEmail(user.getPendingEmail());
        user.setPendingEmail(null);
        // Single-use: the link cannot be replayed to re-verify a later address.
        clearVerifyToken(user);
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
        // An already-verified user following a link is confirming a *change* of
        // address, not an initial verification. This branch used to answer
        // "already verified" and drop `pending_email` on the floor, so changing
        // your address was impossible even once the link itself worked.
        if(null != user.getPendingEmail()) {
          user.setEmail(user.getPendingEmail());
          user.setPendingEmail(null);
          clearVerifyToken(user);
          user.commit();

          res.status(200);
          return new JSONObject()
              .put("status", "ok")
              .put("info", "email address successfully changed");
        }

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
   * Puts a fresh verification token, and its deadline, on a user.
   *
   * <p>Shared with {@code ModifyUserEndpoint}, which mints one when an address
   * change needs confirming. Kept in one place because a token minted without
   * its expiry never expires -- a silent omission that nothing would report.
   *
   * @param user the {@link User}, not yet committed
   */
  static void mintVerifyToken(User user) {
    user.setVerifyToken(UUID.randomUUID());
    user.setVerifyTokenExpires(System.currentTimeMillis() + YasssCore.getVerifyTokenTTL());
  }

  /**
   * Clears a user's verification token and its deadline.
   *
   * @param user the {@link User}, not yet committed
   */
  static void clearVerifyToken(User user) {
    user.setVerifyToken(null);
    user.setVerifyTokenExpires(null);
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
