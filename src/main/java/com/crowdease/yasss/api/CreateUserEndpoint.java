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

      if(!auth.atLeast(Authorization.IS_HUMAN) && !auth.atLeast(AccessLevel.ADMIN))
        throw new EndpointException(req, "access denied", 403);

      final boolean isFirstUser = 0 == User.countUsers(null);
      final String requestedLevel = deserializer.has("accessLevel")
          ? deserializer.getString("accessLevel")
          : null;

      // Requesting a level is an ADMIN-only act. ModifyUserEndpoint:72-74 already
      // gates the same field this way; omitting the check here let any anonymous
      // caller self-provision a platform ADMIN. Denying explicitly rather than
      // silently downgrading, so an admin tool that has lost its credentials
      // fails loudly instead of quietly creating an UNVERIFIED account.
      if(null != requestedLevel && !isFirstUser && !auth.atLeast(AccessLevel.ADMIN))
        throw new EndpointException(req, "access denied", 403);

      final AccessLevel accessLevel = resolveAccessLevel(isFirstUser, requestedLevel);
      if(null == accessLevel)
        throw new EndpointException(req, "malformed argument (accessLevel)", 400);

      // Lowercased before validating: Detail.Type.EMAIL's pattern is
      // lowercase-only by design, mirroring a Java pattern compiled without
      // CASE_INSENSITIVE, so validating raw input rejected every address with a
      // capital letter in it -- which is most of the ones people type.
      final String email = bounded(
          req,
          deserializer.getString("email").strip().toLowerCase(),
          "email");
      if(email.isBlank() || !Detail.Type.EMAIL.isValid(email))
        throw new EndpointException(req, "malformed argument (email)", 400);
      if(null != User.getUser(email))
        throw new EndpointException(req, "conflicting email address found", 409);

      // Tokenized as optional, but the constructor base64-decodes it
      // unconditionally, so omitting it NPE'd into a 500 rather than a 400.
      // A CryptoException from a malformed key is already handled below; this
      // covers the key being absent entirely.
      if(!deserializer.has("pubkey"))
        throw new EndpointException(req, "missing argument (pubkey)", 400);

      final User user;
      try {
        user = new User(
            AccessLevel.UNVERIFIED == accessLevel ? email : null,
            accessLevel,
            validPubkey(req, deserializer.getString("pubkey")));
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

      // The token has to exist before the row is written, so the link in the
      // email and the value in the database cannot disagree.
      if(AccessLevel.UNVERIFIED == user.getAccessLevel())
        user.setVerifyToken(UUID.randomUUID());

      user.commit();

      if(AccessLevel.UNVERIFIED == user.getAccessLevel())
        VerifyUserEndpoint.sendVerificationMail(user);

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created user")
          .put("user", userJSO.put("id", user.getID()));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }

  /**
   * Determines the access level a new account should be granted.
   *
   * <p>The very first account on an empty installation is always an
   * {@link AccessLevel#ADMIN}, so that a fresh deployment has an administrator
   * at all; the level it requested, if any, is irrelevant. Every account after
   * that is {@link AccessLevel#UNVERIFIED} unless a level was requested, and
   * the caller's authority to request one is checked before this is called.
   *
   * <p>Returns a verdict rather than throwing because
   * {@link EndpointException}'s constructor dereferences the Spark
   * {@link Request}, which makes it unusable from a function that is pure by
   * design -- and being pure is the point, since this is the rule worth testing.
   *
   * @param isFirstUser {@code true} if no accounts exist yet
   * @param requestedLevel the level named in the request, or {@code null}
   * @return the level to grant, or {@code null} if {@code requestedLevel} does
   *         not name an {@link AccessLevel} -- which the caller turns into a 400
   */
  static AccessLevel resolveAccessLevel(boolean isFirstUser, String requestedLevel) {
    if(isFirstUser) return AccessLevel.ADMIN;
    if(null == requestedLevel) return AccessLevel.UNVERIFIED;
    try {
      return AccessLevel.valueOf(requestedLevel);
    } catch(IllegalArgumentException e) {
      return null;
    }
  }
}
