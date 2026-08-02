/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import com.crowdease.yasss.YasssCore;

import org.testng.annotations.Test;

/**
 * Covers the CAPTCHA-disabled authorization path.
 *
 * <p>The CAPTCHA validator is only constructed when {@code auth.captcha.required}
 * is enabled, and the shipped default in {@code defaults/yasss.cfg} disables it
 * -- so {@code YasssCore.getCAPTCHAValidator()} is null in a default deployment.
 * Dereferencing it unconditionally meant every request to every endpoint threw
 * a {@link NullPointerException}.
 *
 * <p>The obvious repair -- treating a null validator as a failed check -- is
 * just as wrong, and quieter: registration, credential reset, account
 * verification, anonymous event publication and anonymous volunteer signup all
 * gate on {@code IS_HUMAN}, so they would 403 in precisely the deployments that
 * never wanted CAPTCHAs. These tests pin the intended reading: no CAPTCHA
 * configured means the check does not apply.
 *
 * @author Caleb L. Power
 */
public class CaptchaAuthorizationTest {

  /** The regression itself: no validator configured must not throw. */
  @Test
  public void verifyHumanDoesNotThrowWhenCaptchaIsDisabled() {
    assert null == YasssCore.getCAPTCHAValidator()
        : "this test assumes an unconfigured validator";
    APIEndpoint.verifyHuman(null, "127.0.0.1"); // must not raise
  }

  /** With CAPTCHAs disabled, every caller is treated as human. */
  @Test
  public void callerIsHumanWhenCaptchaIsDisabled() {
    assertTrue(
        APIEndpoint.verifyHuman(null, "127.0.0.1"),
        "a disabled CAPTCHA must not fail the human check, or anonymous signup breaks");
  }

  /** ...and that propagates through to the IS_HUMAN permission. */
  @Test
  public void isHumanPermissionHoldsWhenCaptchaIsDisabled() {
    Authorization auth = new Authorization(null, APIEndpoint.verifyHuman(null, "127.0.0.1"));
    assertTrue(
        auth.atLeast(Authorization.IS_HUMAN),
        "anonymous CreateEvent/AddVolunteer/CreateUser all gate on this");
  }

  /** A caller that failed the check is not human, whatever else is true. */
  @Test
  public void isHumanPermissionFailsWhenTheCheckFailed() {
    Authorization auth = new Authorization(null, false);
    assertFalse(auth.atLeast(Authorization.IS_HUMAN));
  }

  /** Being human is not being authenticated. */
  @Test
  public void humanIsNotAuthenticated() {
    Authorization auth = new Authorization(null, true);
    assertTrue(auth.atLeast(Authorization.IS_HUMAN));
    assertFalse(
        auth.atLeast(Authorization.IS_AUTHENTICATED),
        "a null actor must never read as authenticated");
  }
}
