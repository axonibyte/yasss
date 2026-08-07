/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import com.axonibyte.lib.auth.CryptoException;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.daemon.TicketEngine;
import com.crowdease.yasss.model.AuthNonce;
import com.crowdease.yasss.model.User;

import org.bouncycastle.util.encoders.Base64;
import org.bouncycastle.util.encoders.DecoderException;
import org.json.JSONException;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * An auth token associated with authenticated users that validates and verifies
 * the provided auth string.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class AuthToken {

  private static final String authHeader = "AXB-SIG-REQ";
  private static final Logger logger = LoggerFactory.getLogger(AuthToken.class);

  private final String authString;
  private final boolean credentialsAllowed;

  /**
   * Whether the last {@link #process()} refused a credential purely on its timestamp.
   *
   * <p>Read by {@code APIEndpoint} so the response can carry a hint and the server's
   * clock, which is how a client with a wrong clock recovers rather than being told its
   * password is wrong. Safe to disclose: it is decided before any account is looked up.
   */
  private boolean clockSkewed = false;

  private User user = null;

  /**
   * Instantiates the authorization token.
   *
   * @param authString the raw header containing the credentials to be processed
   * @param credentialsAllowed whether a password-derived credential may be presented
   *        here, as opposed to a session ticket; see {@link #process()}
   */
  public AuthToken(String authString, boolean credentialsAllowed) {
    this.authString = authString;
    this.credentialsAllowed = credentialsAllowed;
  }

  /**
   * Processes the authentication string and generates a session token.
   *
   * <p>Two very different things arrive in the same header. A <em>session ticket</em> is
   * server-issued, short-lived, named by its signer, and subject to
   * {@code session_epoch}. A <em>password credential</em> is client-signed, derived from
   * the user's password, and deliberately <em>not</em> subject to the session epoch --
   * otherwise a platform-wide revoke would be a permanent lockout rather than a forced
   * re-login.
   *
   * <p>That exemption is what makes a captured credential so much worse than a captured
   * ticket. The signed message is {@code {email, mfa}}, which for an account without MFA
   * is byte-identical forever, so anyone who obtains the header once holds a credential
   * that never expires and that no revocation this application offers can withdraw.
   *
   * <p>So a credential is accepted only where one is actually needed: the sign-in route,
   * which is {@code GET /v1} -- there is no {@code /login}; authenticating against the
   * API root <em>is</em> the sign-in. An endpoint opts in by overriding
   * {@code APIEndpoint.acceptsCredentials()}. Everywhere else requires a ticket, which
   * narrows a captured header from "anything, forever, immune to sign-out" to "obtain a
   * session ticket" -- still a full compromise, but one that is bounded by
   * {@code session_epoch} from that point on and that shows up in a revocation.
   *
   * <p>This is a behaviour change for any non-browser consumer that signs every request
   * rather than exchanging a credential for a ticket once. The bundled clients do not:
   * both the frontend and {@code register-admin.mjs} sign exactly one request, against
   * {@code GET /v1}, and use the returned ticket thereafter.
   *
   * @return a session token, if verification is successful
   */
  public String process() throws AuthException, SQLException {
    if(null == authString)
      throw new AuthException("no auth string; skipping");
    else logger.info("processing auth string");

    String[] header = authString.split("\\s+");
    if(2 != header.length || !authHeader.equalsIgnoreCase(header[0]))
      throw new AuthException("malformed Authorization header");

    try {
      // UTF-8 explicitly. This decodes attacker-supplied bytes into the string that
      // verifySig is ultimately called on, so the platform default would mean a caller
      // whose email contains a non-ASCII character authenticates on a UTF-8 host and not
      // on any other. Pinning the library's charset alone does not fix that -- the JSON
      // is already mangled by the time it gets there.
      JSONObject payload = new JSONObject(
          new String(
              Base64.decode(header[1]),
              StandardCharsets.UTF_8));

      // The decoded payload carries the caller's credentials and signature;
      // it must never be logged.

      String sig = payload.getString("sig");
      String creds = payload.getString("creds");
      // Which signer produced `sig`, when this server produced it. Carried in
      // the envelope rather than inside `creds` because `creds` is what gets
      // signed, so the signer would have to be chosen before it exists. It needs
      // no integrity protection of its own: a wrong or absent value simply fails
      // to verify.
      UUID signerID = null;
      if(payload.has("kid")) {
        try {
          signerID = UUID.fromString(payload.getString("kid"));
        } catch(IllegalArgumentException e) {
          // Indistinguishable from a signature that does not verify.
        }
      }

      JSONObject credsJSO;

      try {
        credsJSO = new JSONObject(
            new String(
                Base64.decode(creds),
                StandardCharsets.UTF_8));
      } catch(DecoderException e) {
        credsJSO = new JSONObject(creds);
      }

      // Parsed before the user is resolved, because a v2 credential addresses the
      // account differently and because everything cheap and account-independent --
      // shape, audience, freshness -- is better decided before touching the database.
      final SigReqV2.Credential v2 =
          SigReqV2.isV2(credsJSO) ? SigReqV2.parse(credsJSO) : null;

      if(null != v2) {
        if(!YasssCore.getSigAudience().equals(v2.audience()))
          throw new AuthException(
              "credential names audience %1$s, not ours", v2.audience());

        // Before any lookup, so the hint is triggerable by any caller with any garbage
        // and therefore says nothing about whether an account exists.
        var freshness = SigReqV2.evaluate(v2, System.currentTimeMillis(), YasssCore.getSigMaxSkew());
        if(SigReqV2.Verdict.VALID != freshness) {
          clockSkewed = true;
          throw new AuthException("credential is %1$s", freshness.name());
        }

        if(null != v2.email()) user = User.getUser(v2.email());
        else user = User.getUser(UUID.fromString(v2.account()));

      } else if(credsJSO.has("account")) {
        user = User.getUser(
            UUID.fromString(
                credsJSO.getString("account")));
      } else if(credsJSO.has("email")) {
        user = User.getUser(
            credsJSO.getString("email"));
      }

      if(null == user)
        throw new AuthException("user does not exist");

      final long now = System.currentTimeMillis();

      // Carried forward unchanged from the presented ticket, so that refreshing
      // a session cannot extend it past session.absoluteTimeout. A fresh sign-in
      // starts the clock here -- but strictly after any revocation already on
      // the account, because SessionTicket treats a session beginning *at* the
      // epoch as revoked. Signing in again in the same millisecond as a reset or
      // a sign-out-everywhere is not far-fetched: those endpoints stamp the
      // epoch with the same clock, and the client's next request follows
      // immediately.
      long sessionStart = freshSessionStart(user, now);

      // Note the `else`: without it this fell straight through into signature
      // verification, so disabling the signin requirement did not actually
      // bypass authentication the way the log message claims it does.
      if(!YasssCore.authRequired()) {
        logger.warn(
            "user {} underwent de facto authentication by virtue of disabled auth requirement",
            user.getID().toString());
      } else if(credentialsAllowed && null != v2
          && user.verifySig(
              new String(v2.canonicalBytes(), StandardCharsets.US_ASCII), sig)
          && user.isMFASatisfied(v2.mfa())
          && spend(user, v2)) {
        // A v2 credential: fresh, bound to this audience, and now spent. The signature is
        // checked over bytes rebuilt from the values above rather than over the string as
        // it arrived -- see SigReqV2 for why those are not the same thing.
        logger.info(
            "user {} successfully authenticated (new session, v2)",
            user.getID().toString());

      } else if(credentialsAllowed && null == v2 && YasssCore.acceptLegacySig()
          && user.verifySig(creds, sig)
          && (null == user.getEncMFASecret()
              || user.verifyTOTP(
                  credsJSO.getString("mfa")))) {
        // Real credentials. Deliberately not subject to the session epoch: a
        // revocation must invalidate outstanding tickets, not lock an account
        // out of signing in again -- otherwise a platform-wide revoke is a
        // permanent outage rather than a forced re-login.
        logger.info(
            "user {} successfully authenticated (new session)",
            user.getID().toString());
      } else if(YasssCore.getTicketEngine().verify(creds, sig, signerID)) {
        var verdict = SessionTicket.evaluate(
            credsJSO,
            user.getSessionEpoch(),
            now,
            YasssCore.getSessionIdleTimeout(),
            YasssCore.getSessionAbsoluteTimeout());
        if(SessionTicket.Verdict.VALID != verdict)
          throw new AuthException(
              "user %1$s presented a %2$s session",
              user.getID().toString(),
              verdict.name());

        sessionStart = SessionTicket.sessionStart(credsJSO, now);
        logger.info(
            "user {} successfully authenticated via ticket engine",
            user.getID().toString());
      } else {
        // Named rather than folded into the generic failure below, because the two are
        // very different events and only one of them is interesting. This costs an extra
        // signature check, but only on a request that has already failed to authenticate.
        if(!credentialsAllowed && user.verifySig(creds, sig))
          throw new AuthException(
              "user %1$s presented a password credential outside the sign-in route",
              user.getID().toString());

        throw new AuthException("user %1$s failed to authenticate", user.getID().toString());
      }

      // TODO probably need to rework this a bit so that it also serves as a CSRF token

      return issue(user.getID(), sessionStart, now);

    } catch(DecoderException | IllegalArgumentException | JSONException e) {
      // A malformed Authorization header is an ordinary client error -- the
      // request simply proceeds anonymously -- so it does not warrant a stack
      // trace. Printing one gave any caller a way to flood the log with a
      // single bad header, and buried genuine faults among the noise.
      logger.debug(
          "could not decode {} payload: {}",
          authHeader,
          e.getMessage());
      throw new AuthException("failed to decode %1$s payload", authHeader);
    }

  }

  /**
   * Mints a session ticket.
   *
   * <p>Shared with the endpoints that revoke sessions: an account signing every
   * other device out has to be handed a ticket that survives its own
   * revocation, or the one useful thing it just did also signs it out.
   *
   * @param account the account the ticket speaks for
   * @param sessionStart when the session began, carried forward from the
   *        presented ticket
   * @param now the current epoch millisecond
   * @return the base64 ticket, ready for the {@code AXB-SESSION} header
   * @throws AuthException if the ticket could not be signed
   */
  static String issue(UUID account, long sessionStart, long now) throws AuthException {
    String sessionCreds = Base64.toBase64String(
        SessionTicket.issue(account, sessionStart, now)
            .toString()
            // Only ever UUIDs and longs, so ASCII in practice -- but a ticket this
            // process encodes is decoded by the block above, and having the two ends
            // disagree about the charset is precisely the bug being closed.
            .getBytes(StandardCharsets.UTF_8));

    TicketEngine.Signature signature;
    try {
      signature = YasssCore.getTicketEngine().sign(sessionCreds);
    } catch(CryptoException e) {
      throw new AuthException("failed to sign session token");
    }

    return Base64.toBase64String(
        new JSONObject()
            .put("creds", sessionCreds)
            .put("sig", signature.value())
            .put("kid", signature.signerID().toString())
            .toString()
            .getBytes(StandardCharsets.UTF_8));
  }

  /**
   * Retrieves the user associated with verified credentials.
   *
   * @return the user if verified; {@code null} otherwise
   */
  public User getUser() {
    return user;
  }

  /**
   * An exception to be thrown in the event that an auth string cannot be processed.
   *
   * @author Caleb L. Power <cpower@crowdease.com>
   */
  /**
   * When a newly established session begins.
   *
   * <p>Strictly after any revocation already on the account, because
   * {@code SessionTicket.evaluate} treats a session beginning <em>at</em> the epoch as
   * revoked. Signing in again in the same millisecond as a reset or a sign-out-everywhere
   * is not far-fetched: those endpoints stamp the epoch from the same clock and the
   * client's next request follows immediately.
   *
   * <p>Extracted rather than copied into the passkey path. A second copy that drifted
   * would be a session that outlives the revocation meant to end it.
   *
   * @param user the account signing in
   * @param now epoch milliseconds
   * @return the instant the session starts
   */
  static long freshSessionStart(User user, long now) {
    return Math.max(now, user.getSessionEpoch() + 1);
  }

  /**
   * Whether the failure was a clock-skew rejection rather than a bad credential.
   *
   * @return {@code true} if the credential's timestamp was outside the skew window
   */
  public boolean clockSkewed() {
    return clockSkewed;
  }

  /**
   * Spends the credential's nonce, refusing a replay.
   *
   * <p>Called last in the credential branch, after the signature and any MFA code have
   * already been accepted, so that a nonce cannot be burned by somebody who merely
   * observed the credential in flight. A replay therefore costs one signature
   * verification, which is microseconds.
   *
   * <p>A database failure here is <em>not</em> a replay and must not be reported as one:
   * it propagates, so a broken ledger is an error rather than a silent refusal of every
   * sign-in.
   */
  private boolean spend(User user, SigReqV2.Credential credential) throws SQLException {
    AuthNonce.reapIfDue(System.currentTimeMillis(), YasssCore.getSigMaxSkew());
    return AuthNonce.claim(user.getID(), credential.nonceBytes(), credential.issuedAt());
  }

  public static class AuthException extends Exception {
    AuthException(String format, Object... args) {
      super(String.format(format, args));
    }
  }
  
}
