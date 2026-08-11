/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import org.testng.annotations.Test;

/**
 * Which endpoints serve anonymous callers, stated once so it cannot drift.
 *
 * <p>{@link com.axonibyte.lib.http.rest.Endpoint} fails closed: anything that
 * neither overrides {@code authenticate} nor declares itself public answers 401
 * to everybody. That default is right, and it is also silent -- an endpoint
 * that forgets is not broken at boot, it is broken for whoever visits.</p>
 *
 * <p>It did forget. {@code PublicTextEndpoint} extends the framework base
 * rather than {@link APIEndpoint}, so the call to action, the terms, the
 * privacy policy and the tutorial's operator deck all answered 401 to every
 * caller -- signed in or not, since the frontend sends no credentials to them
 * on purpose. Nothing failed loudly; the landing page simply had no copy on
 * it.</p>
 *
 * <p>Both directions are asserted. A test that only checked the public one
 * would be equally happy if somebody made the report public too.</p>
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public class PublicEndpointAuthTest {

  /**
   * The operator's public copy, which an anonymous visitor is meant to read
   * before deciding whether to sign up at all.
   */
  @Test public void testPublicTextEndpoint_servesAnonymousCallers() {
    assertFalse(
        new PublicTextEndpoint().authRequired(),
        "the public texts must be readable without signing in");
  }

  /**
   * The sign-in sheet, which is nobody's business but the organizer's. It
   * authenticates properly, so it keeps the fail-closed default.
   */
  @Test public void testEventReportEndpoint_requiresAuthentication() {
    assertTrue(
        new EventReportEndpoint().authRequired(),
        "the event report lists real people and must not be public");
  }
}
