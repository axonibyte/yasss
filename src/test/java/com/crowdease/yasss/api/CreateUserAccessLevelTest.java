/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertNull;

import com.crowdease.yasss.model.User.AccessLevel;

import org.testng.annotations.Test;

/**
 * Covers which access level a new account is granted.
 *
 * <p>This existed as an inline branch reading {@code accessLevel} straight off
 * the request body with no authority check, so any anonymous caller could
 * self-provision a platform ADMIN simply by asking for one. Its sibling,
 * {@code ModifyUserEndpoint}, gates the same field on ADMIN -- which is what
 * establishes that the omission was an oversight rather than a decision.
 *
 * <p>The authority check now lives in the endpoint, immediately before this is
 * called, because it needs the {@link Authorization}. What is tested here is
 * the resolution rule itself, which is pure and therefore worth pinning: the
 * first account bootstraps as ADMIN so a fresh deployment has an administrator
 * at all, and everything after it is UNVERIFIED unless a level was both
 * requested and permitted.
 *
 * @author Caleb L. Power
 */
public class CreateUserAccessLevelTest {

  /** A fresh installation needs an administrator, so the first account is one. */
  @Test
  public void firstAccountIsAdmin() {
    assertEquals(
        CreateUserEndpoint.resolveAccessLevel(true, null),
        AccessLevel.ADMIN);
  }

  /**
   * ...and it stays an administrator whatever it asked for. Otherwise the
   * bootstrap could be poisoned by whoever reached an empty deployment first.
   */
  @Test
  public void firstAccountIgnoresWhatWasRequested() {
    for(String requested : new String[] { "BANNED", "UNVERIFIED", "STANDARD", "nonsense" }) {
      assertEquals(
          CreateUserEndpoint.resolveAccessLevel(true, requested),
          AccessLevel.ADMIN,
          "first account should be ADMIN regardless of a requested " + requested);
    }
  }

  /** Ordinary registration, asking for nothing, is unverified. */
  @Test
  public void ordinaryRegistrationIsUnverified() {
    assertEquals(
        CreateUserEndpoint.resolveAccessLevel(false, null),
        AccessLevel.UNVERIFIED);
  }

  /**
   * A permitted request is honoured. The endpoint only reaches this with a
   * requested level once it has confirmed the caller is an ADMIN.
   */
  @Test
  public void aPermittedRequestIsHonoured() {
    assertEquals(
        CreateUserEndpoint.resolveAccessLevel(false, "STANDARD"),
        AccessLevel.STANDARD);
    assertEquals(
        CreateUserEndpoint.resolveAccessLevel(false, "ADMIN"),
        AccessLevel.ADMIN);
  }

  /** An unrecognised level is a verdict of null, which the endpoint makes a 400. */
  @Test
  public void anUnknownLevelIsRejected() {
    assertNull(CreateUserEndpoint.resolveAccessLevel(false, "SUPERUSER"));
    assertNull(CreateUserEndpoint.resolveAccessLevel(false, ""));
  }

  /**
   * The enum is matched exactly, as {@code valueOf} does. Worth pinning because
   * the level arrives as free text from a request body, and a case-insensitive
   * match here would be a quiet way to reintroduce surprise.
   */
  @Test
  public void levelMatchingIsCaseSensitive() {
    assertNull(CreateUserEndpoint.resolveAccessLevel(false, "admin"));
    assertNull(CreateUserEndpoint.resolveAccessLevel(false, "Standard"));
  }

  /**
   * Every level is resolvable by name, so the endpoint's 400 really does mean
   * "not a level" rather than "a level this happens not to handle".
   */
  @Test
  public void everyLevelResolvesByItsOwnName() {
    for(AccessLevel level : AccessLevel.values()) {
      assertEquals(
          CreateUserEndpoint.resolveAccessLevel(false, level.name()),
          level);
    }
  }
}
