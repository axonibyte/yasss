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
 * Endpoint responsible for resetting a user's credentials.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class ResetUserEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ResetUserEndpoint() {
    super("/users/:user", APIVersion.VERSION_1, HTTPMethod.POST);
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
      } catch(IllegalArgumentException e) {
        user = User.getUser(req.params("user"));
      }
      
      if(null == user)
        throw new EndpointException(req, "user not found", 404);
      
      String reqBody = req.body();
      
      try {
        
        if(null == reqBody || reqBody.isEmpty())
          throw new EmptyBodyException();
        
        JSONDeserializer deserializer = new JSONDeserializer(req.body())
            .tokenize("token", false)
            .tokenize("pubkey", false)
            .check();
        
        if(!deserializer.has("token") && !deserializer.has("pubkey"))
          throw new EmptyBodyException();

        // The reset token is an account-takeover credential; never log it.

        // A stored token rather than a TicketEngine signature. The signers
        // rotate and used to be lost on restart, so a reset link was dead within
        // fifteen minutes of being sent and immediately on any deploy -- the
        // same defect migration 011 fixed for verification links and did not
        // fix here. Now it lives exactly as long as token.resetTTL says.
        switch(ExpiringToken.check(
            user.getResetToken(),
            user.getResetTokenExpires(),
            deserializer.getString("token"),
            System.currentTimeMillis())) {

        case NO_MATCH:
          throw new EndpointException(req, "access denied", 403);

        case EXPIRED:
          throw new EndpointException(req, "reset link has expired", 410);

        default:
          break;
        }

        try {
          // validPubkey, as on create and modify. setPubkey rejects malformed
          // base64 but not well-formed base64 of the wrong length, which
          // overflows BINARY(32) and comes back as a 500 -- exactly the case
          // validPubkey's javadoc says it exists for. This was the one
          // credential path still missing it.
          user.setPubkey(
              validPubkey(req, deserializer.getString("pubkey").strip()));
        } catch(CryptoException e) {
          throw new EndpointException(req, "malformed argument (pubkey)", 400, e);
        }

        // Single-use, like the verification link.
        user.setResetToken(null);
        user.setResetTokenExpires(null);

        // A password change kills every session on the account. Whoever forced
        // the reset may be exactly who is sitting in one of them, and until now
        // resetting the credential left their sessions untouched -- the new
        // password locked nobody out.
        //
        // No reissue: this endpoint is reached without authentication, by
        // definition. The caller signs in with the credential they just set.
        user.setSessionEpoch(System.currentTimeMillis());

        user.commit();

        res.status(200);
        return new JSONObject()
            .put("status", "ok")
            .put("info", "credentials successfully reset");

      } catch(EmptyBodyException e) {

        if(null == user.getEmail())
          throw new EndpointException(req, "user has no verified email", 409);

        // A fresh token per request, which also invalidates any earlier one: two
        // reset emails in an inbox and only the newer works.
        user.setResetToken(UUID.randomUUID());
        user.setResetTokenExpires(System.currentTimeMillis() + YasssCore.getResetTokenTTL());
        // Committed before the mail goes out, so a mailer failure cannot leave a
        // token in somebody's inbox that the database never stored.
        user.commit();

        Map<String, String> args = new HashMap<>();
        args.put(
            "RESET_LINK",
            String.format(
                "%1$s?action=reset-user&user=%2$s&token=%3$s",
                YasssCore.getAPIHost(),
                user.getID().toString(),
                user.getResetToken().toString()));

        Mail mail = new Mail(
            user.getEmail(),
            "reset-user",
            args);
        mail.send();

        res.status(202);
        return new JSONObject()
            .put("status", "ok")
            .put("info", "credential reset request initiated");
      }
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }

  private static final class EmptyBodyException extends Exception { }
  
}
