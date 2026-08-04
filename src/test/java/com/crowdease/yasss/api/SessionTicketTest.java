/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertEquals;

import java.util.UUID;

import com.crowdease.yasss.api.SessionTicket.Verdict;

import org.json.JSONObject;
import org.testng.annotations.Test;

/**
 * Covers the rules that decide whether a signed session ticket is still worth
 * anything.
 *
 * <p>The signature only proves this server issued the ticket. Everything that
 * makes a session end -- inactivity, age, a password reset, a ban, a sign-out --
 * happens here, and none of it is observable from a signature check. That makes
 * this the whole of the session policy, which is why it is a pure function
 * taking its clock as an argument rather than something wired into
 * {@code AuthToken}: the boundaries are testable in a millisecond instead of
 * seven days.
 *
 * @author Caleb L. Power
 */
public class SessionTicketTest {

  private static final long NOW = 1_700_000_000_000L;
  private static final long IDLE = 7L * 24 * 60 * 60 * 1000;  // seven days
  private static final long ABSOLUTE = 30L * 24 * 60 * 60 * 1000;  // thirty days

  private static Verdict verdict(JSONObject creds, long epoch) {
    return SessionTicket.evaluate(creds, epoch, NOW, IDLE, ABSOLUTE);
  }

  private static JSONObject ticket(long sessionStart, long issuedAt) {
    return new JSONObject()
        .put(SessionTicket.CLAIM_ACCOUNT, UUID.randomUUID().toString())
        .put(SessionTicket.CLAIM_SESSION_START, sessionStart)
        .put(SessionTicket.CLAIM_ISSUED_AT, issuedAt);
  }

  @Test public void accepts_aFreshTicket() {
    assertEquals(verdict(ticket(NOW, NOW), 0L), Verdict.VALID);
  }

  @Test public void accepts_anOldSessionThatIsStillInUse() {
    // Twenty-nine days old, touched a minute ago. Neither timeout has run out,
    // and this is the ordinary case for anyone who uses the platform regularly.
    assertEquals(
        verdict(ticket(NOW - 29L * 24 * 60 * 60 * 1000, NOW - 60_000L), 0L),
        Verdict.VALID);
  }

  @Test public void rejects_aTicketWithNoTimingClaims() {
    // Every session issued before this existed. Refused, which signs the user
    // base out exactly once at upgrade -- against the previous behaviour of
    // signing them out on every deploy and again every fifteen minutes.
    assertEquals(
        verdict(new JSONObject().put(SessionTicket.CLAIM_ACCOUNT, UUID.randomUUID()), 0L),
        Verdict.LEGACY);
  }

  @Test public void rejects_aTicketWithUnparseableClaims() {
    // Not reachable from a ticket this server signed, but the decoder is fed
    // whatever arrives in the header and must not throw out of evaluate().
    assertEquals(
        verdict(
            new JSONObject()
                .put(SessionTicket.CLAIM_SESSION_START, "yesterday")
                .put(SessionTicket.CLAIM_ISSUED_AT, "now"),
            0L),
        Verdict.LEGACY);
    assertEquals(verdict(null, 0L), Verdict.LEGACY);
  }

  @Test public void rejects_anIdleSession() {
    assertEquals(
        verdict(ticket(NOW - IDLE - 1, NOW - IDLE - 1), 0L),
        Verdict.EXPIRED_IDLE);
  }

  @Test public void accepts_atTheIdleBoundary() {
    // Exactly at the limit is still good; the check is `>`, not `>=`.
    assertEquals(verdict(ticket(NOW - IDLE, NOW - IDLE), 0L), Verdict.VALID);
  }

  @Test public void rejects_aSessionPastItsAbsoluteLifetime() {
    // Restamped a moment ago, so not idle at all -- which is the point. Without
    // the absolute check a script refreshing a ticket on a timer would hold a
    // session open indefinitely.
    assertEquals(
        verdict(ticket(NOW - ABSOLUTE - 1, NOW - 1000L), 0L),
        Verdict.EXPIRED_ABSOLUTE);
  }

  @Test public void accepts_atTheAbsoluteBoundary() {
    assertEquals(verdict(ticket(NOW - ABSOLUTE, NOW - 1000L), 0L), Verdict.VALID);
  }

  @Test public void rejects_aRevokedSession() {
    assertEquals(verdict(ticket(NOW - 1000L, NOW), NOW - 500L), Verdict.REVOKED);
  }

  @Test public void rejects_aSessionStartingAtTheRevocationItself() {
    // `<=`, not `<`. A revocation stamped in the same millisecond as a login has
    // to win: the cost of this choice is that a login racing a revocation by
    // under a millisecond must be repeated, and the cost of the other is a
    // session surviving the revocation it was meant to end.
    assertEquals(verdict(ticket(NOW - 1000L, NOW), NOW - 1000L), Verdict.REVOKED);
  }

  @Test public void accepts_aSessionStartedAfterTheRevocation() {
    // Signing in again after a reset or a sign-out-everywhere must work, or a
    // platform-wide revoke is a permanent outage rather than a forced re-login.
    assertEquals(verdict(ticket(NOW - 999L, NOW), NOW - 1000L), Verdict.VALID);
  }

  @Test public void revocation_outranksBothTimeouts() {
    // An expired *and* revoked session reports REVOKED, because that is the one
    // somebody deliberately caused and the one worth seeing in the log when the
    // support ticket says "it signed me out".
    assertEquals(
        verdict(ticket(NOW - ABSOLUTE - 1, NOW - IDLE - 1), NOW - 1000L),
        Verdict.REVOKED);
  }

  @Test public void issue_carriesTheSessionStartForward() {
    // The mechanism behind the absolute timeout: refreshing a ticket restamps
    // `iat` and must leave `sat` alone. If issue() ever stamped both, sessions
    // would live for ever and the absolute-timeout tests above would still pass.
    UUID account = UUID.randomUUID();
    long started = NOW - 5000L;

    JSONObject issued = SessionTicket.issue(account, started, NOW);

    assertEquals(issued.getString(SessionTicket.CLAIM_ACCOUNT), account.toString());
    assertEquals(issued.getLong(SessionTicket.CLAIM_SESSION_START), started);
    assertEquals(issued.getLong(SessionTicket.CLAIM_ISSUED_AT), NOW);
    assertEquals(SessionTicket.sessionStart(issued, NOW), started);
  }

  @Test public void sessionStart_fallsBackWhenAbsent() {
    // A legacy ticket never reaches here -- evaluate() has already refused it --
    // but the fallback is what stops a null from becoming a session that started
    // at the epoch and is therefore permanently expired.
    assertEquals(SessionTicket.sessionStart(new JSONObject(), NOW), NOW);
    assertEquals(SessionTicket.sessionStart(null, NOW), NOW);
  }
}
