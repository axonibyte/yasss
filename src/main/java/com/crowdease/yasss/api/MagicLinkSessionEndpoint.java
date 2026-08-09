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
import com.crowdease.yasss.model.ExpiringToken;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import spark.Request;
import spark.Response;

/**
 * Signing in with an emailed link.
 *
 * <h2>Why this exists</h2>
 *
 * <p>Email is this application's recovery root. An account that has turned password
 * sign-in off and then lost every passkey has nothing else left, and "enroll a second
 * passkey" is advice, not a guarantee — devices get dropped in rivers.
 *
 * <p>It is also the sign-in path for a browser with no WebAuthn support, once an account
 * has stopped accepting a password. Without it, turning the password off would mean
 * "unusable on that machine" rather than "signs in differently".
 *
 * <p>So this is not optional garnish on the passkey work. It is the floor underneath it.
 *
 * <h2>What it is not</h2>
 *
 * <p>It does not clear {@code password_login_disabled}. Getting signed in is enough — from
 * there the account holder can enroll a passkey or turn the password back on, deliberately,
 * from a screen that says what it is doing. {@code ResetUserEndpoint} clears the flag,
 * because installing a new public key is an explicit statement that a password is wanted.
 *
 * <p>The token is the same one {@code ResetUserEndpoint} issues and is spent the same way:
 * one use, then gone. Both answer the same question — does this person control the mailbox
 * — so minting two kinds of emailed credential would be two things to get wrong.
 *
 * @author Caleb L. Power
 */
public final class MagicLinkSessionEndpoint extends APIEndpoint {

  private static final Logger LOG =
      LoggerFactory.getLogger(MagicLinkSessionEndpoint.class);

  /** Instantiates the endpoint. */
  public MagicLinkSessionEndpoint() {
    super("users/:user/sessions", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth)
      throws EndpointException {
    try {
      User user = null;
      try {
        user = User.getUser(UUID.fromString(req.params("user")));
      } catch(IllegalArgumentException e) { }

      // Deliberately the same 403 a bad token gets. Distinguishing "no such account" from
      // "wrong token" would make this an oracle for which accounts exist, on an endpoint
      // that has to be anonymous.
      if(null == user)
        throw new EndpointException(req, "access denied", 403);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("token", true)
          .check();

      long now = System.currentTimeMillis();

      // Never logged, here or anywhere: this token is an account-takeover credential.
      switch(ExpiringToken.check(
          user.getResetToken(),
          user.getResetTokenExpires(),
          deserializer.getString("token"),
          now)) {

      case NO_MATCH:
        throw new EndpointException(req, "access denied", 403);

      case EXPIRED:
        throw new EndpointException(req, "that link has expired", 410);

      default:
        break;
      }

      // Single-use, like every other emailed token here. Spent before the session is
      // issued, so a failure below cannot leave a live link in an inbox.
      user.setResetToken(null);
      user.setResetTokenExpires(null);
      user.commit();

      long sessionStart = AuthToken.freshSessionStart(user, now);
      String ticket;
      try {
        ticket = AuthToken.issue(user.getID(), sessionStart, now);
      } catch(AuthToken.AuthException e) {
        throw new EndpointException(req, "could not issue a session", 500);
      }

      // setHeader rather than header, which appends. See APIEndpoint.reissueSession.
      res.raw().setHeader(ACCOUNT_HEADER, user.getID().toString());
      res.raw().setHeader(ACCESS_LEVEL_HEADER, user.getAccessLevel().name());
      res.raw().setHeader(SESSION_HEADER, ticket);

      LOG.info("login method=magiclink user={}", user.getID().toString());


      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "signed in")
          .put("email", user.getEmail());

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
