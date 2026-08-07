/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import com.crowdease.yasss.model.RelyingPartyConfig.Refusal;

import org.testng.annotations.Test;

/**
 * The most load-bearing test in the passkey tier, because it is the only one that can
 * catch what it catches.
 *
 * <p>A WebAuthn credential is bound to its RP ID for life, and an RP ID may not be an IP
 * address. The shipped {@code api.host} <em>is</em> an IP address, so a deployment that
 * takes the defaults cannot perform a single ceremony — and the failure happens inside the
 * browser, where no server log sees it.
 *
 * <p>The browser tier cannot find this. Playwright's virtual authenticator replaces
 * {@code navigator.credentials} in the page and derives the RP ID from the origin with no
 * registrable-suffix check, so every Playwright spec passes green against
 * {@code 127.0.0.1} while production fails. That is the "works in tests, fails in
 * production" shape this plan was most likely to ship, and this file is the compensating
 * control.
 *
 * @author Caleb L. Power
 */
public class RelyingPartyConfigTest {

  private static final String ORIGINS = "same-origin";

  @Test public void theShippedDefaultIsRefused() {
    // defaults/yasss.cfg and e2e/config/yasss.cfg both ship exactly this. If this test
    // ever passes, somebody has made an IP address look like a valid relying party.
    var resolved = RelyingPartyConfig.resolve(null, "http://127.0.0.1:7455", ORIGINS);

    assertFalse(resolved.usable());
    assertEquals(resolved.refusal(), Refusal.IP_LITERAL);
  }

  @Test public void anIPv6LiteralIsRefused() {
    var resolved = RelyingPartyConfig.resolve(null, "http://[::1]:7455", ORIGINS);

    assertFalse(resolved.usable());
    assertEquals(resolved.refusal(), Refusal.IP_LITERAL);
  }

  @Test public void anIPLiteralGivenDirectlyAsTheRpIDIsAlsoRefused() {
    // Setting passkey.rpID explicitly must not be a way around the check.
    assertEquals(
        RelyingPartyConfig.resolve("127.0.0.1", "https://yasss.example.org", ORIGINS).refusal(),
        Refusal.IP_LITERAL);
  }

  @Test public void localhostIsAccepted() {
    // Both trustworthy and a legal RP ID, which is what makes it the right value for the
    // e2e stack and for local development. Ports are irrelevant to an RP ID, so one entry
    // covers the Vite dev server and the Java server alike.
    var resolved = RelyingPartyConfig.resolve(null, "http://localhost:7455", ORIGINS);

    assertTrue(resolved.usable());
    assertEquals(resolved.rpID(), "localhost");
  }

  @Test public void aRealHostnameIsDerivedFromApiHost() {
    var resolved = RelyingPartyConfig.resolve(null, "https://yasss.example.org", ORIGINS);

    assertTrue(resolved.usable());
    assertEquals(resolved.rpID(), "yasss.example.org");
    assertEquals(resolved.origins(), java.util.Set.of("https://yasss.example.org"));
  }

  @Test public void anExplicitRpIDWins() {
    // For a deployment fronted by something whose name api.host does not carry.
    var resolved = RelyingPartyConfig.resolve(
        "example.org", "https://yasss.example.org", ORIGINS);

    assertTrue(resolved.usable());
    assertEquals(resolved.rpID(), "example.org");
  }

  @Test public void aURLGivenWhereAHostnameBelongsIsRefused() {
    // The obvious misconfiguration: pasting api.host's value into passkey.rpID. It would
    // otherwise be accepted as a hostname and fail in the browser.
    for(String bad : new String[] {
        "https://yasss.example.org", "yasss.example.org:7455", "yasss.example.org/", }) {
      assertEquals(
          RelyingPartyConfig.resolve(bad, "https://yasss.example.org", ORIGINS).refusal(),
          Refusal.NOT_A_BARE_HOST,
          bad + " should be refused");
    }
  }

  @Test public void nothingToDeriveFromIsRefused() {
    assertEquals(
        RelyingPartyConfig.resolve(null, null, ORIGINS).refusal(), Refusal.MISSING);
    assertEquals(
        RelyingPartyConfig.resolve(null, "not a url at all", ORIGINS).refusal(),
        Refusal.MISSING);
  }

  @Test public void severalOriginsAreHonoured() {
    // Local development is two origins: Vite on 5173 and the Java server on 7455. The RP
    // ID covers both because ports do not enter into it, but the origin check is exact.
    var resolved = RelyingPartyConfig.resolve(
        null, "http://localhost:7455", "http://localhost:7455,http://localhost:5173");

    assertTrue(resolved.usable());
    assertEquals(
        resolved.origins(),
        java.util.Set.of("http://localhost:7455", "http://localhost:5173"));
  }

  @Test public void aWildcardOriginIsDiscardedRatherThanHonoured() {
    // api.allowedOrigins may legitimately be '*'. If that value were ever copied here, or
    // the two parameters were conflated, a ceremony performed at any site would be
    // accepted -- which is the exact attack WebAuthn's origin binding exists to prevent.
    var resolved = RelyingPartyConfig.resolve(
        null, "https://yasss.example.org", "*,https://yasss.example.org");

    assertTrue(resolved.usable());
    assertEquals(resolved.origins(), java.util.Set.of("https://yasss.example.org"));
  }

  @Test public void aWildcardAloneLeavesNoOriginsRatherThanAllOfThem() {
    var resolved = RelyingPartyConfig.resolve(null, "https://yasss.example.org", "*");

    assertTrue(resolved.usable(), "the relying party itself is fine");
    assertTrue(resolved.origins().isEmpty(), "but no ceremony origin was accepted");
  }
}
