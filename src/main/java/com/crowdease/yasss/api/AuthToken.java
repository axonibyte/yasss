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

  private User user = null;

  /**
   * Instantiates the authorization token.
   *
   * @param authString the raw header containing the credentials to be processed
   */
  public AuthToken(String authString) {
    this.authString = authString;
  }

  /**
   * Processes the authentication string and generates a session token.
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

      if(credsJSO.has("account")) {
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
      long sessionStart = Math.max(now, user.getSessionEpoch() + 1);

      // Note the `else`: without it this fell straight through into signature
      // verification, so disabling the signin requirement did not actually
      // bypass authentication the way the log message claims it does.
      if(!YasssCore.authRequired()) {
        logger.warn(
            "user {} underwent de facto authentication by virtue of disabled auth requirement",
            user.getID().toString());
      } else if(user.verifySig(creds, sig)
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
  public static class AuthException extends Exception {
    AuthException(String format, Object... args) {
      super(String.format(format, args));
    }
  }
  
}
