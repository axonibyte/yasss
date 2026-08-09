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

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Passkey;
import com.crowdease.yasss.model.PasskeyChallenge;
import com.crowdease.yasss.model.PasskeyVerifier;
import com.crowdease.yasss.model.User;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import spark.Request;
import spark.Response;

/**
 * Signing in with a passkey.
 *
 * <h2>Why this is not the {@code AXB-SIG-REQ} header</h2>
 *
 * <p>{@code AuthToken.process} runs before {@code onCall} and turns a failure into an
 * <em>anonymous</em> request rather than a 401, so there is nowhere in that path to say
 * "here is a challenge, try again". Making {@code authenticate} able to do that would be a
 * platform-wide change for one feature. An assertion is also 600–1200 bytes against
 * Jetty's 8 KB header buffer, and putting a single-use artefact in a header the client
 * caches and replays invites exactly the bug you would expect.
 *
 * <p>Nothing downstream changes: on success this sets the same three headers {@code GET /v1}
 * does, so ticket rotation, the refresh timer and {@code SessionTicket.evaluate} are
 * untouched. It replaces only the login moment.
 *
 * <h2>Usernameless on purpose</h2>
 *
 * <p>The begin half takes no email. It could — an email would let the response carry
 * {@code allowCredentials} — and that would make it an oracle for whether an address is
 * registered, on an endpoint that has to be anonymous. {@code User.getUser(String)} already
 * carries a note about this codebase having been bitten by an endpoint that answered
 * questions about accounts the caller could not name. The cost is that a non-discoverable
 * credential (an older security key) cannot be used to sign in; that is acceptable.
 *
 * @author Caleb L. Power
 */
public final class PasskeyAuthEndpoint extends APIEndpoint {

  private static final Logger LOG =
      LoggerFactory.getLogger(PasskeyAuthEndpoint.class);

  /** Which half of the ceremony an instance serves. */
  public static enum Mode {

    /** {@code POST /v1/passkeys/challenge} */
    BEGIN("passkeys/challenge"),

    /** {@code POST /v1/passkeys/session} */
    FINISH("passkeys/session");

    private final String resource;

    private Mode(String resource) {
      this.resource = resource;
    }
  }

  private final Mode mode;

  /**
   * Instantiates the endpoint.
   *
   * @param mode which half this instance serves
   */
  public PasskeyAuthEndpoint(Mode mode) {
    super(mode.resource, APIVersion.VERSION_1, HTTPMethod.POST);
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
      return Mode.BEGIN == mode ? begin(req, res) : finish(req, res);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }

  private JSONObject begin(Request req, Response res) throws SQLException {
    long now = System.currentTimeMillis();
    PasskeyChallenge.prune(now);

    var issued = PasskeyChallenge.issue(PasskeyChallenge.Ceremony.AUTHENTICATION, null, now);

    res.status(200);
    return new JSONObject()
        .put("status", "ok")
        .put("info", "challenge issued")
        .put("challenge", Base64.getEncoder().encodeToString(issued.challenge()))
        .put("rpID", YasssCore.getRelyingParty().rpID())
        .put("expiresAt", issued.expiresAt());
  }

  private JSONObject finish(Request req, Response res) throws EndpointException, SQLException {
    JSONObject body = bodyOf(req);

    byte[] challenge = decode(req, body, "challenge");
    byte[] credentialID = decode(req, body, "credentialID");
    byte[] clientDataJSON = decode(req, body, "clientDataJSON");
    byte[] authenticatorData = decode(req, body, "authenticatorData");
    byte[] signature = decode(req, body, "signature");
    byte[] userHandle = body.has("userHandle") ? decode(req, body, "userHandle") : null;

    long now = System.currentTimeMillis();
    var claim = PasskeyChallenge.claim(challenge, PasskeyChallenge.Ceremony.AUTHENTICATION, now);

    if(!claim.claimed())
      throw new EndpointException(req, "challenge not recognized", 403);
    if(!claim.usable())
      throw new EndpointException(req, "challenge expired", 410);

    Passkey passkey = Passkey.byCredentialID(credentialID);
    if(null == passkey)
      throw new EndpointException(req, "credential not recognized", 403);

    User user = User.getUser(passkey.getUser());
    if(null == user)
      throw new EndpointException(req, "credential not recognized", 403);

    PasskeyVerifier.Asserted asserted;
    try {
      asserted = PasskeyVerifier.verifyAuthentication(
          passkey, challenge, clientDataJSON, authenticatorData, signature, userHandle);
    } catch(PasskeyVerifier.PasskeyException e) {
      throw new EndpointException(req, "assertion did not verify", 403);
    }

    if(!Passkey.counterIsAcceptable(passkey.getSignCount(), asserted.signCount()))
      throw new EndpointException(req, "assertion did not verify", 403);

    // MFA is decided on what the assertion actually reported, not on what was asked for.
    // A passkey that verified the user -- a biometric or a PIN -- is already two factors
    // and is phishing-resistant besides, which TOTP is not, so requiring a code on top is
    // theatre. A security key tapped without a PIN is one factor and still needs it.
    //
    // Reading the request rather than the result is the accidental-downgrade bug here:
    // userVerification is a preference, not a guarantee.
    if(!asserted.userVerified() && null != user.getEncMFASecret())
      throw new EndpointException(
          req,
          "this passkey did not verify you, so a one-time code is still required",
          403);

    passkey.recordUse(asserted.signCount(), now);

    // Same expression as the credential path, through the same helper, so a revocation
    // cannot be outlived by a session that started at the wrong instant.
    long sessionStart = AuthToken.freshSessionStart(user, now);
    String ticket;
    try {
      ticket = AuthToken.issue(user.getID(), sessionStart, now);
    } catch(AuthToken.AuthException e) {
      // The ticket engine could not sign, which is a server fault rather than anything
      // the caller did -- they have just proven who they are.
      throw new EndpointException(req, "could not issue a session", 500);
    }

    // setHeader, not header: Spark's Response.header appends, and if the caller was
    // already authenticated then authenticate() has set AXB-SESSION already. Two of them
    // is not a fix. See APIEndpoint.reissueSession.
    res.raw().setHeader(ACCOUNT_HEADER, user.getID().toString());
    res.raw().setHeader(ACCESS_LEVEL_HEADER, user.getAccessLevel().name());
    res.raw().setHeader(SESSION_HEADER, ticket);

    LOG.info(
        "login method=passkey uv={} user={}",
        asserted.userVerified(), user.getID().toString());


    res.status(200);
    return new JSONObject()
        .put("status", "ok")
        .put("info", "signed in")
        // A usernameless sign-in never tells the client whose account it reached, so
        // without this `session.email` stays null and the surfaces that offer to reuse it
        // -- the reminder opt-in prefill -- silently stop working. It is the caller's own
        // account, so this discloses nothing.
        .put("email", user.getEmail());
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
