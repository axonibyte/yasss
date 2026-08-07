/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.Base64;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Passkey;
import com.crowdease.yasss.model.PasskeyChallenge;
import com.crowdease.yasss.model.PasskeyVerifier;
import com.crowdease.yasss.model.User;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Enrolling a passkey: the challenge, and the credential that answers it.
 *
 * <p>Two resources in one class, following {@code RevokeSessionsEndpoint} — the ceremony
 * is one thing in two halves and splitting it would let the halves drift.
 *
 * @author Caleb L. Power
 */
public final class PasskeyRegistrationEndpoint extends APIEndpoint {

  /** Which half of the ceremony an instance serves. */
  public static enum Mode {

    /** {@code POST /v1/users/:user/passkeys/challenge} */
    BEGIN("users/:user/passkeys/challenge", HTTPMethod.POST),

    /** {@code POST /v1/users/:user/passkeys} */
    FINISH("users/:user/passkeys", HTTPMethod.POST);

    private final String resource;
    private final HTTPMethod method;

    private Mode(String resource, HTTPMethod method) {
      this.resource = resource;
      this.method = method;
    }
  }

  private final Mode mode;

  /**
   * Instantiates the endpoint.
   *
   * @param mode which half this instance serves
   */
  public PasskeyRegistrationEndpoint(Mode mode) {
    super(mode.resource, APIVersion.VERSION_1, mode.method);
    this.mode = mode;
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth)
      throws EndpointException {
    if(null == YasssCore.getRelyingParty())
      throw new EndpointException(req, "passkeys are not available", 501);

    try {
      User user = null;
      try {
        user = User.getUser(UUID.fromString(req.params("user")));
      } catch(IllegalArgumentException e) { }

      if(null == user)
        throw new EndpointException(req, "user not found", 404);

      if(!auth.atLeast(user))
        throw new EndpointException(req, "access denied", 403);

      // Email is the recovery root for an account that has turned its password off, and
      // an unverified account has none -- CreateUserEndpoint leaves `email` null and fills
      // `pending_email`, and ResetUserEndpoint refuses to mail a link without a verified
      // address. Enrolling a passkey on such an account would create something with no
      // recovery path at all.
      //
      // It also avoids a second hazard: User.commit reconciles pending addresses by
      // deleting other users whose pending_email matches a newly verified one, and the
      // passkey table cascades. An unverified account's passkey could vanish because
      // somebody else verified the same address first.
      if(null == user.getEmail())
        throw new EndpointException(
            req,
            "verify your email address before enrolling a passkey; it is how the account "
            + "is recovered if the passkey is lost",
            409);

      return Mode.BEGIN == mode ? begin(req, res, user) : finish(req, res, user);

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }

  private JSONObject begin(Request req, Response res, User user)
      throws EndpointException, SQLException {
    long now = System.currentTimeMillis();
    PasskeyChallenge.prune(now);

    var issued = PasskeyChallenge.issue(
        PasskeyChallenge.Ceremony.REGISTRATION, user.getID(), now);

    // Every credential already on the account, so that re-presenting an authenticator
    // fails cleanly with InvalidStateError rather than silently enrolling a duplicate.
    JSONArray exclude = new JSONArray();
    for(Passkey existing : Passkey.byUser(user.getID()))
      exclude.put(b64(existing.getCredentialID()));

    res.status(200);
    return new JSONObject()
        .put("status", "ok")
        .put("info", "challenge issued")
        .put("challenge", b64(issued.challenge()))
        .put("rpID", YasssCore.getRelyingParty().rpID())
        .put("rpName", YasssCore.getRelyingPartyName())
        // The account UUID's sixteen bytes, which IS the user handle. Not the email: the
        // handle is stored on the authenticator and returned in an assertion before
        // authentication, so an address there would be readable by anyone who can prompt
        // the device.
        .put("userHandle", b64(uuidBytes(user.getID())))
        .put("userName", user.getEmail())
        .put("excludeCredentials", exclude)
        .put("expiresAt", issued.expiresAt());
  }

  private JSONObject finish(Request req, Response res, User user)
      throws EndpointException, SQLException {
    JSONObject body = bodyOf(req);

    byte[] challenge = decode(req, body, "challenge");
    byte[] clientDataJSON = decode(req, body, "clientDataJSON");
    byte[] attestationObject = decode(req, body, "attestationObject");

    Set<String> transports = new HashSet<>();
    JSONArray reported = body.optJSONArray("transports");
    if(null != reported)
      for(int i = 0; i < reported.length(); i++) transports.add(reported.getString(i));

    long now = System.currentTimeMillis();
    var claim = PasskeyChallenge.claim(challenge, PasskeyChallenge.Ceremony.REGISTRATION, now);

    if(!claim.claimed())
      throw new EndpointException(req, "challenge not recognised", 403);
    if(!claim.usable())
      throw new EndpointException(req, "challenge expired", 410);
    // A challenge issued for one account cannot be finished onto another.
    if(!user.getID().equals(claim.user()))
      throw new EndpointException(req, "challenge was issued for another account", 403);

    PasskeyVerifier.Registered registered;
    try {
      registered = PasskeyVerifier.verifyRegistration(
          challenge, clientDataJSON, attestationObject, transports.isEmpty() ? null : transports);
    } catch(PasskeyVerifier.PasskeyException e) {
      throw new EndpointException(req, "registration did not verify", 403);
    }

    // Refused rather than truncated. Well-formed input of the wrong length overflowing a
    // column is the exact failure recorded on APIEndpoint.validPubkey; a 400 says what is
    // wrong, a 500 does not.
    if(Passkey.MAX_CREDENTIAL_ID_BYTES < registered.credentialID().length)
      throw new EndpointException(req, "credential identifier is too long", 400);

    if(null != Passkey.byCredentialID(registered.credentialID()))
      throw new EndpointException(req, "that passkey is already enrolled", 409);

    String label = body.optString("label", null);
    if(null != label && 255 < label.length())
      throw new EndpointException(req, "malformed argument (label)", 400);

    new Passkey(
        UUID.randomUUID(),
        user.getID(),
        registered.credentialID(),
        registered.publicKey(),
        YasssCore.getRelyingParty().rpID(),
        registered.signCount(),
        registered.transports(),
        registered.aaguid(),
        label,
        registered.backupEligible(),
        registered.backupState(),
        now,
        null).store();

    // Deliberately no session_epoch bump. ModifyUserEndpoint revokes on a pubkey change
    // because the old password may be compromised; adding a new credential implies
    // nothing about the old one, and signing every other device out for it would read as
    // a bug.
    res.status(201);
    return new JSONObject()
        .put("status", "ok")
        .put("info", "passkey enrolled");
  }

  /** Base64 of raw bytes, the encoding every field in this ceremony uses. */
  private static String b64(byte[] raw) {
    return Base64.getEncoder().encodeToString(raw);
  }

  private static byte[] uuidBytes(UUID id) {
    return java.nio.ByteBuffer.allocate(16)
        .putLong(id.getMostSignificantBits())
        .putLong(id.getLeastSignificantBits())
        .array();
  }

  private static JSONObject bodyOf(Request req) throws EndpointException {
    try {
      return new JSONObject(req.body());
    } catch(Exception e) {
      throw new EndpointException(req, "malformed request body", 400);
    }
  }

  private static byte[] decode(Request req, JSONObject body, String field)
      throws EndpointException {
    try {
      return Base64.getDecoder().decode(body.getString(field));
    } catch(Exception e) {
      throw new EndpointException(req, "malformed argument (" + field + ")", 400);
    }
  }
}
