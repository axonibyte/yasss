/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertNull;

import com.crowdease.yasss.model.Volunteer.ReminderState;

import org.testng.annotations.Test;

/**
 * Covers who a reminder is addressed to and whether it still needs confirming.
 *
 * <p>These rules govern whether the platform mails an address, so the failure
 * modes are the ones that get a sending domain blocklisted: confirming an
 * address nobody proved, or silently keeping a confirmation across a change of
 * address. Both are one flipped condition away and neither is visible in a
 * browser until mail is already going out.
 *
 * @author Caleb L. Power
 */
public class ReminderConsentTest {

  private static final String ACCOUNT = "ada@example.com";
  private static final String OTHER = "grace@example.com";

  @Test public void resolve_requestedAddress_pendsForAnonymous() {
    var decision = ReminderConsent.resolve(OTHER, null, false, null, null);
    assertNull(decision.error());
    assertEquals(decision.email(), OTHER);
    assertEquals(decision.state(), ReminderState.PENDING);
  }

  @Test public void resolve_noAddressAndNoAccount_isAnError() {
    var decision = ReminderConsent.resolve(null, null, false, null, null);
    assertNotNull(decision.error());
    assertNull(decision.email());
  }

  @Test public void resolve_blankAddressIsTreatedAsAbsent() {
    // The frontend omits the key entirely, but a hand-rolled client may send
    // "" -- which must not reach the anchored email pattern as a value.
    var decision = ReminderConsent.resolve("   ", null, false, null, null);
    assertNotNull(decision.error());
  }

  @Test public void resolve_signedInWithNoAddress_fallsBackToTheAccount() {
    var decision = ReminderConsent.resolve(null, ACCOUNT, true, null, null);
    assertNull(decision.error());
    assertEquals(decision.email(), ACCOUNT);
    // Already proven by the account, so no confirmation email is owed.
    assertEquals(decision.state(), ReminderState.CONFIRMED);
  }

  @Test public void resolve_unverifiedAccountAddressIsNotAFallback() {
    // An unverified account's address has not been proven, so it is neither
    // borrowed as a default nor treated as pre-confirmed.
    var decision = ReminderConsent.resolve(null, ACCOUNT, false, null, null);
    assertNotNull(decision.error());
  }

  @Test public void resolve_unverifiedAccountAddress_pendsWhenNamed() {
    var decision = ReminderConsent.resolve(ACCOUNT, ACCOUNT, false, null, null);
    assertNull(decision.error());
    assertEquals(decision.state(), ReminderState.PENDING);
  }

  @Test public void resolve_namingOwnAccountAddress_isPreConfirmed() {
    var decision = ReminderConsent.resolve(ACCOUNT, ACCOUNT, true, null, null);
    assertEquals(decision.state(), ReminderState.CONFIRMED);
  }

  @Test public void resolve_namingSomebodyElsesAddress_pends() {
    // The load-bearing one. If this ever returned CONFIRMED, a signed-in user
    // could subscribe an arbitrary stranger with no confirmation step.
    var decision = ReminderConsent.resolve(OTHER, ACCOUNT, true, null, null);
    assertEquals(decision.email(), OTHER);
    assertEquals(decision.state(), ReminderState.PENDING);
  }

  @Test public void resolve_unchangedConfirmedAddress_staysConfirmed() {
    // Editing an unrelated field must not silently unsubscribe someone until
    // they re-click a link they were never sent.
    var decision = ReminderConsent.resolve(
        OTHER, null, false, OTHER, ReminderState.CONFIRMED);
    assertEquals(decision.state(), ReminderState.CONFIRMED);
  }

  @Test public void resolve_changedAddress_mustBeReproven() {
    // The other load-bearing one: a confirmation does not transfer to a
    // different address.
    var decision = ReminderConsent.resolve(
        "eve@example.com", null, false, OTHER, ReminderState.CONFIRMED);
    assertEquals(decision.email(), "eve@example.com");
    assertEquals(decision.state(), ReminderState.PENDING);
  }

  @Test public void resolve_pendingAddressStaysPending() {
    var decision = ReminderConsent.resolve(
        OTHER, null, false, OTHER, ReminderState.PENDING);
    assertEquals(decision.state(), ReminderState.PENDING);
  }

  @Test public void resolve_normalizesCaseAndWhitespace() {
    // The server's EMAIL pattern has no CASE_INSENSITIVE flag, so an address
    // that arrives capitalized fails validation unless it is folded first.
    var decision = ReminderConsent.resolve("  Ada@Example.COM ", null, false, null, null);
    assertNull(decision.error());
    assertEquals(decision.email(), ACCOUNT);
  }

  @Test public void resolve_caseDifferingAccountAddressIsStillTheAccount() {
    var decision = ReminderConsent.resolve("ADA@EXAMPLE.COM", ACCOUNT, true, null, null);
    assertEquals(decision.state(), ReminderState.CONFIRMED);
  }

  @Test public void resolve_malformedAddressIsRejected() {
    for(String bad : new String[] { "not-an-address", "a@b@c.com", "@example.com", "ada@" }) {
      var decision = ReminderConsent.resolve(bad, null, false, null, null);
      assertNotNull(decision.error(), "should have rejected: " + bad);
    }
  }

  @Test public void resolve_overlongAddressIsRejected() {
    // reminder_email is VARCHAR(255); a longer address would be truncated into
    // a different address by the INSERT rather than refused.
    String local = "a".repeat(250);
    var decision = ReminderConsent.resolve(local + "@example.com", null, false, null, null);
    assertNotNull(decision.error());
  }
}
