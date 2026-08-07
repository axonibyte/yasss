/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import org.testng.annotations.Test;

/**
 * The signature-counter matrix, which the browser tier cannot produce.
 *
 * <p>The counter exists to detect a cloned authenticator: a genuine one only counts up, so
 * a value that failed to advance suggests two copies of one credential.
 *
 * <p>The trap is that <b>most authenticators do not implement it</b>. iCloud Keychain,
 * Google Password Manager and a synced Windows Hello credential all report zero, always,
 * because a credential living on several devices has no single counter. Writing the
 * obvious rule — {@code received > stored} — refuses every login from most of the user
 * base, because 0 is not greater than 0.
 *
 * <p>Playwright's virtual authenticator increments its counter on every assertion, like a
 * hardware key, so no browser test here can reach the case that matters. This file is the
 * compensating control.
 *
 * @author Caleb L. Power
 */
public class PasskeyCounterTest {

  @Test public void anAuthenticatorThatDoesNotCountIsAccepted() {
    // The case that matters, and the one no test with a virtual authenticator produces.
    // Every synced passkey looks like this, on every sign-in, forever.
    assertTrue(Passkey.counterIsAcceptable(0, 0));
  }

  @Test public void aCounterThatAdvancesIsAccepted() {
    assertTrue(Passkey.counterIsAcceptable(0, 1));
    assertTrue(Passkey.counterIsAcceptable(5, 6));
    assertTrue(Passkey.counterIsAcceptable(5, 500));
  }

  @Test public void aCounterThatStandsStillIsRefused() {
    // Two copies of one credential, or a replayed assertion. Refused -- but only once the
    // authenticator has shown it counts at all, which is what separates this from the
    // first case.
    assertFalse(Passkey.counterIsAcceptable(5, 5));
  }

  @Test public void aCounterThatGoesBackwardsIsRefused() {
    assertFalse(Passkey.counterIsAcceptable(5, 4));
    assertFalse(Passkey.counterIsAcceptable(5, 0));
  }

  @Test public void anAuthenticatorThatStartsCountingIsAccepted() {
    // A stored zero with a non-zero arrival is not a clone; it is a device that began
    // counting, or a credential that moved off a synced store.
    assertTrue(Passkey.counterIsAcceptable(0, 7));
  }

  @Test public void theCounterNearItsCeilingStillBehaves() {
    // The column is BIGINT UNSIGNED but the value is carried as a signed long; the spec's
    // counter is 32-bit, so this is headroom rather than a real case. Pinned so that a
    // future change to the storage type has to think about it.
    assertTrue(Passkey.counterIsAcceptable(4_294_967_294L, 4_294_967_295L));
    assertFalse(Passkey.counterIsAcceptable(4_294_967_295L, 4_294_967_295L));
  }
}
