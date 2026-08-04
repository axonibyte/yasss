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

      // Tracked because a credential change and a ban both end the account's
      // existing sessions, and the response has to be adjusted afterwards rather
      // than before -- authenticate() has already minted a ticket by the time
      // this runs.
      boolean revoke = false;
      final AccessLevel priorLevel = user.getAccessLevel();

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

        // A ban that leaves the banned party's session working is not a ban.
        // Their access level is re-read on every request, so most endpoints
        // would refuse them -- but the session itself survived, which is not
        // what the word means. Only on the transition, so that an unrelated
        // edit to an already-banned account does not keep bumping the epoch.
        if(AccessLevel.BANNED == user.getAccessLevel() && AccessLevel.BANNED != priorLevel)
          revoke = true;
      }

      boolean emailChanged = false;
      if(deserializer.has("email")) {
        // Lowercased before validating. `Detail.Type.EMAIL`'s pattern is
        // deliberately lowercase-only -- it mirrors a Java pattern compiled
        // without CASE_INSENSITIVE -- so validating the raw input rejected
        // every address anyone actually types. `ReminderConsent.resolve`
        // already had this right; the account paths did not.
        final String email = bounded(
            req,
            deserializer.getString("email").strip().toLowerCase(),
            "email");
        if(email.isBlank() || !Detail.Type.EMAIL.isValid(email))
          throw new EndpointException(req, "malformed argument (email)", 400);
        // `getEmail()` is null for anyone who has not verified yet --
        // CreateUserEndpoint leaves it null and populates pendingEmail -- so
        // an ADMIN editing an unverified account, which is the documented
        // recovery path, dereferenced null and got a 500.
        if((emailChanged = !email.equalsIgnoreCase(user.getEmail()))
            && null != User.getUser(email))
          throw new EndpointException(req, "conflicting email address found", 409);

        if(auth.atLeast(AccessLevel.ADMIN))
          user.setEmail(email);
        else user.setPendingEmail(email);
      }

      if(deserializer.has("pubkey")) {
        try {
          user.setPubkey(
              validPubkey(req, deserializer.getString("pubkey").strip()));
        } catch(CryptoException e) {
          throw new EndpointException(req, "malformed argument (pubkey)", 400, e);
        }
        // A credential change ends every session established under the old one.
        // Without this, someone who changed their password because they thought
        // it had leaked left whoever had it signed in indefinitely.
        revoke = true;
      }

      if(revoke) user.setSessionEpoch(System.currentTimeMillis());

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
      
      // The link used to carry a TicketEngine signature while VerifyUserEndpoint
      // compared against the stored `verify_token` UUID -- so it could never
      // match and email changes were simply impossible. Migration 011 moved
      // verification onto a durable token and this call site was not moved with
      // it.
      final boolean sendChangeMail = AccessLevel.ADMIN != user.getAccessLevel() && emailChanged;
      if(sendChangeMail) VerifyUserEndpoint.mintVerifyToken(user);

      user.commit();

      // After the commit, so a failed save cannot hand out a ticket for a
      // revocation that did not happen. Only for the account that asked: an
      // administrator resetting somebody else keeps their own session, and
      // must not be handed one belonging to the account they just edited.
      if(revoke
          && null != auth.getActor()
          && auth.getActor().getID().equals(user.getID()))
        reissueSession(res, user, user.getSessionEpoch());

      // Committed before the mail is sent, not after: a mailer failure must not
      // leave a token in an inbox that the database never stored. The same rule
      // is documented on sendVerificationMail.
      if(sendChangeMail) {
        Map<String, String> args = new HashMap<>();
        args.put(
            "VERIFY_LINK",
            String.format(
                "%1$s?action=verify-user&user=%2$s&token=%3$s",
                YasssCore.getAPIHost(),
                user.getID().toString(),
                user.getVerifyToken().toString()));

        Mail mail = new Mail(
            user.getPendingEmail(),
            "email-change",
            args);
        mail.send();
      }

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated user")
          .put("user", userJSO);
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
