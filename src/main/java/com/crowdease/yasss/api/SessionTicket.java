/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.util.UUID;

import org.json.JSONObject;

/**
 * The claims carried by a session ticket, and the rules for believing them.
 *
 * <p>A ticket is the {@code creds} half of the {@code Authorization} header: a
 * base64-encoded JSON object, signed by the {@code TicketEngine}. The signature
 * proves this server issued it. These claims decide whether it is still worth
 * anything.
 *
 * <p>Three questions, and they are genuinely different:
 *
 * <ul>
 *   <li><strong>Idle</strong> -- {@code iat} is restamped on every authenticated
 *       response, so {@code now - iat} is how long the session has been
 *       untouched.</li>
 *   <li><strong>Absolute</strong> -- {@code sat} is copied forward unchanged, so
 *       {@code now - sat} is the age of the session itself. Without it a ticket
 *       refreshed by a script would live for ever.</li>
 *   <li><strong>Revoked</strong> -- a session that began at or before the
 *       account's {@code session_epoch} is dead regardless of either timeout.
 *       This is the only one that acts immediately, and it is why the epoch
 *       lives on the {@code user} row: {@code AuthToken} already loads it on
 *       every authenticated request, so the check costs nothing extra.</li>
 * </ul>
 *
 * <p>Everything here is static and takes its clock as an argument, so
 * {@code SessionTicketTest} can walk the whole matrix, boundaries included,
 * without a database or a wait.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class SessionTicket {

  /** The account this ticket speaks for. Present since the beginning. */
  public static final String CLAIM_ACCOUNT = "account";

  /** Session start: when the account last presented real credentials. */
  public static final String CLAIM_SESSION_START = "sat";

  /** Issued at: when this particular ticket was minted. */
  public static final String CLAIM_ISSUED_AT = "iat";

  /**
   * The verdict on a ticket that has already been shown to bear a valid
   * signature.
   */
  public static enum Verdict {

    /** Good; the request proceeds authenticated. */
    VALID,

    /**
     * A ticket from before sessions carried timing claims.
     *
     * <p>Refused, which signs every existing user out exactly once at upgrade.
     * That is strictly better than the previous behavior, which signed everyone
     * out on every deploy and again every fifteen minutes.
     */
    LEGACY,

    /** Untouched for longer than {@code session.idleTimeout}. */
    EXPIRED_IDLE,

    /** Alive for longer than {@code session.absoluteTimeout}. */
    EXPIRED_ABSOLUTE,

    /** Superseded by a revocation: a password reset, a ban, or a sign-out. */
    REVOKED
  }

  /**
   * Judges a ticket's claims.
   *
   * @param creds the decoded {@code creds} object
   * @param sessionEpoch the account's revocation watermark; 0 if never revoked
   * @param now the current epoch millisecond
   * @param idleMillis how long a session may go untouched
   * @param absoluteMillis how long a session may live at all
   * @return the {@link Verdict}
   */
  public static Verdict evaluate(
      JSONObject creds, long sessionEpoch, long now, long idleMillis, long absoluteMillis) {
    if(null == creds) return Verdict.LEGACY;

    long sessionStart;
    long issuedAt;
    try {
      sessionStart = creds.getLong(CLAIM_SESSION_START);
      issuedAt = creds.getLong(CLAIM_ISSUED_AT);
    } catch(RuntimeException e) {
      // Absent, or present as something that is not a number. Both mean this
      // ticket did not come from a version that stamps them.
      return Verdict.LEGACY;
    }

    // Revocation is checked first because it is the only verdict that somebody
    // deliberately caused, and it is the one worth seeing in the log when a
    // support ticket says "it signed me out".
    //
    // `<=` rather than `<`: a revocation stamped at the same millisecond as a
    // login must win. The cost of the tie-breaking choice is that a login racing
    // a revocation by under a millisecond has to be repeated; the cost of the
    // other choice is a session surviving a revocation.
    if(sessionStart <= sessionEpoch) return Verdict.REVOKED;

    if(now - issuedAt > idleMillis) return Verdict.EXPIRED_IDLE;
    if(now - sessionStart > absoluteMillis) return Verdict.EXPIRED_ABSOLUTE;

    return Verdict.VALID;
  }

  /**
   * Builds the claims for a ticket about to be signed.
   *
   * @param account the account it speaks for
   * @param sessionStart when the session began -- carried forward unchanged from
   *        the presented ticket, or {@code now} for a fresh sign-in. Copying it
   *        forward is what makes the absolute timeout absolute
   * @param now the current epoch millisecond
   * @return the claims
   */
  public static JSONObject issue(UUID account, long sessionStart, long now) {
    return new JSONObject()
        .put(CLAIM_ACCOUNT, account.toString())
        .put(CLAIM_SESSION_START, sessionStart)
        .put(CLAIM_ISSUED_AT, now);
  }

  /**
   * Reads the session start out of a ticket, for carrying forward.
   *
   * @param creds the decoded {@code creds} object
   * @param fallback what to use when the claim is absent
   * @return the session start
   */
  public static long sessionStart(JSONObject creds, long fallback) {
    if(null == creds) return fallback;
    try {
      return creds.getLong(CLAIM_SESSION_START);
    } catch(RuntimeException e) {
      return fallback;
    }
  }

  private SessionTicket() { }

}
