/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertEquals;

import java.util.UUID;

import com.crowdease.yasss.model.ExpiringToken.Status;

import org.testng.annotations.Test;

/**
 * Covers the check behind both emailed tokens.
 *
 * <p>Supersedes {@code VerifyTokenTest}: verification and credential reset now
 * share one comparison, so the cases that mattered there matter here, and the
 * expiry cases are new.
 *
 * <p>Four of these carry real weight. A cleared token must match nothing, or a
 * used link could be replayed against a later address. A malformed token must be
 * a quiet {@code NO_MATCH} rather than an exception, since the value arrives
 * straight off a URL. A null deadline must mean "does not expire" rather than
 * "expired in 1970", which is what every link minted before migration 022 has.
 * And {@code EXPIRED} must be unreachable without a matching token, or the
 * 410/403 split becomes an oracle for whether an account has a reset
 * outstanding.
 *
 * @author Caleb L. Power
 */
public class ExpiringTokenTest {

  private static final long NOW = 1_700_000_000_000L;

  @Test public void accepts_theStoredToken() {
    UUID token = UUID.randomUUID();
    assertEquals(
        ExpiringToken.check(token, NOW + 1000L, token.toString(), NOW),
        Status.VALID);
  }

  @Test public void accepts_regardlessOfHexCase() {
    // Mail clients and URL handlers do fold case; UUID.fromString accepts both,
    // and the comparison is on the parsed value rather than the text.
    UUID token = UUID.randomUUID();
    assertEquals(
        ExpiringToken.check(token, NOW + 1000L, token.toString().toUpperCase(), NOW),
        Status.VALID);
  }

  @Test public void accepts_aTokenWithNoDeadline() {
    // Migration 022 leaves verify_token_expires NULL on every token that
    // predates it. Treating that as expired would break links already sitting
    // in inboxes at the moment of upgrade.
    UUID token = UUID.randomUUID();
    assertEquals(ExpiringToken.check(token, null, token.toString(), NOW), Status.VALID);
  }

  @Test public void accepts_atTheDeadlineItself() {
    // `now > expires`, not `>=`: the stated lifetime is inclusive of its last
    // millisecond. Pinned because the off-by-one is invisible in practice and
    // would be silently "fixed" in either direction.
    UUID token = UUID.randomUUID();
    assertEquals(ExpiringToken.check(token, NOW, token.toString(), NOW), Status.VALID);
  }

  @Test public void expires_oneMillisecondLater() {
    UUID token = UUID.randomUUID();
    assertEquals(
        ExpiringToken.check(token, NOW - 1L, token.toString(), NOW),
        Status.EXPIRED);
  }

  @Test public void rejects_aDifferentToken() {
    assertEquals(
        ExpiringToken.check(
            UUID.randomUUID(),
            NOW + 1000L,
            UUID.randomUUID().toString(),
            NOW),
        Status.NO_MATCH);
  }

  @Test public void rejects_whenNothingIsOutstanding() {
    // The load-bearing one. Consuming a link clears the token, so a link that
    // has already been used must not work against a later pending address.
    assertEquals(
        ExpiringToken.check(null, NOW + 1000L, UUID.randomUUID().toString(), NOW),
        Status.NO_MATCH);
  }

  @Test public void rejects_aMalformedToken() {
    // Straight off a URL, so this is ordinary input, not an edge case.
    UUID token = UUID.randomUUID();
    for(String bad : new String[] { "", "not-a-uuid", "../../etc/passwd", "null" })
      assertEquals(
          ExpiringToken.check(token, NOW + 1000L, bad, NOW),
          Status.NO_MATCH,
          "should have rejected: " + bad);
  }

  @Test public void rejects_anAbsentToken() {
    assertEquals(
        ExpiringToken.check(UUID.randomUUID(), NOW + 1000L, null, NOW),
        Status.NO_MATCH);
  }

  @Test public void rejects_bothAbsent() {
    assertEquals(ExpiringToken.check(null, null, null, NOW), Status.NO_MATCH);
  }

  @Test public void expired_isNeverReachableWithoutAMatch() {
    // The 410 tells the caller "this link was yours and it lapsed". Reaching it
    // with a wrong token would tell them "an account with this address has a
    // reset outstanding", one guess at a time. A long-lapsed deadline plus a
    // wrong token must still be an ordinary NO_MATCH.
    assertEquals(
        ExpiringToken.check(
            UUID.randomUUID(),
            NOW - 10_000_000L,
            UUID.randomUUID().toString(),
            NOW),
        Status.NO_MATCH);
    assertEquals(
        ExpiringToken.check(UUID.randomUUID(), NOW - 10_000_000L, "not-a-uuid", NOW),
        Status.NO_MATCH);
    assertEquals(
        ExpiringToken.check(null, NOW - 10_000_000L, UUID.randomUUID().toString(), NOW),
        Status.NO_MATCH);
  }
}
