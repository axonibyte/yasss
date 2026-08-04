/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.daemon;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import org.testng.annotations.Test;

/**
 * Covers how many signing keys the ticket engine keeps.
 *
 * <p>The trap this exists for: persisting the signers achieves nothing if they
 * are still evicted fifteen minutes later. The shipped configuration used to
 * pin {@code refreshInterval: 1} and {@code maxHistory: 15}, so a session died
 * after a quarter of an hour of inactivity while {@code session.absoluteTimeout}
 * claimed thirty days -- and the symptom looks exactly like the persistence not
 * working, which is a day lost to debugging the wrong thing.
 *
 * @author Caleb L. Power
 */
public class TicketRetentionTest {

  private static final int SEVEN_DAYS = 7 * 24 * 60;
  private static final int THIRTY_DAYS = 30 * 24 * 60;

  @Test public void shippedDefaults_coverTheAbsoluteTimeout() {
    // refreshInterval 1440 (a day), maxHistory 15, absoluteTimeout 30 days.
    // 15 days of history is not enough, so it stretches to 30 keys.
    int count = TicketEngine.signerCount(1440, 15, THIRTY_DAYS);
    assertEquals(count, 30);
    assertTrue(
        (long)count * 1440 >= THIRTY_DAYS,
        "the retained keys must span the longest a session may live");
  }

  @Test public void aGenerousHistoryIsHonoured() {
    // When ticket.* already covers more than the session lifetime, it wins:
    // it is a floor on retention, not a ceiling.
    assertEquals(TicketEngine.signerCount(1440, 90, THIRTY_DAYS), 90);
  }

  @Test public void aShortSessionLifetimeDoesNotShrinkTheHistory() {
    assertEquals(TicketEngine.signerCount(1440, 15, 60), 15);
  }

  @Test public void theLegacyPinnedConfigIsClampedRatherThanHonoured() {
    // The configuration that shipped before this change, against the new
    // defaults: one key per minute for thirty days is 43,200 keys and 43,200
    // rows written a day. Clamped to something bounded; the engine warns and
    // says which knob to turn.
    int count = TicketEngine.signerCount(1, 15, THIRTY_DAYS);
    assertEquals(count, TicketEngine.MAX_SIGNERS);
    assertTrue(
        (long)count * 1 < THIRTY_DAYS,
        "and the clamp is real -- this is the case the warning is for");
  }

  @Test public void roundsUpRatherThanDown() {
    // A partial interval at the end still needs a key. Rounding down would make
    // the last hours of a session's permitted lifetime unverifiable, which is an
    // off-by-one nobody would ever reproduce deliberately.
    assertEquals(TicketEngine.signerCount(1440, 1, SEVEN_DAYS), 7);
    assertEquals(TicketEngine.signerCount(1000, 1, SEVEN_DAYS), 11);  // 10.08 -> 11
  }

  @Test public void neverReturnsZero() {
    // An engine with no keys cannot sign, and sign() is on the path of every
    // authenticated response.
    assertEquals(TicketEngine.signerCount(1440, 1, 0), 1);
    assertTrue(0 < TicketEngine.signerCount(100_000, 1, 1));
  }
}
