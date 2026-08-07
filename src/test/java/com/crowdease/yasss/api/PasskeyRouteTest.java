/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotEquals;

import java.lang.reflect.Method;

import com.crowdease.yasss.model.PasskeyChallenge.Ceremony;

import org.testng.annotations.Test;

/**
 * Properties of the passkey routes that are decidable without a database.
 *
 * @author Caleb L. Power
 */
public class PasskeyRouteTest {

  private static boolean acceptsCredentials(APIEndpoint endpoint) throws Exception {
    Method m = APIEndpoint.class.getDeclaredMethod("acceptsCredentials");
    m.setAccessible(true);
    return (boolean)m.invoke(endpoint);
  }

  @Test public void noPasskeyRouteAcceptsAPasswordCredential() throws Exception {
    // A password credential is a bearer token session_epoch cannot revoke, so the set of
    // endpoints accepting one stays exactly the sign-in route. The passkey routes have
    // their own ceremony and need none -- and the sign-in half is anonymous besides.
    assertFalse(acceptsCredentials(
        new PasskeyRegistrationEndpoint(PasskeyRegistrationEndpoint.Mode.BEGIN)));
    assertFalse(acceptsCredentials(
        new PasskeyRegistrationEndpoint(PasskeyRegistrationEndpoint.Mode.FINISH)));
    assertFalse(acceptsCredentials(new PasskeyListEndpoint(PasskeyListEndpoint.Mode.LIST)));
    assertFalse(acceptsCredentials(new PasskeyListEndpoint(PasskeyListEndpoint.Mode.REMOVE)));
    assertFalse(acceptsCredentials(new PasskeyAuthEndpoint(PasskeyAuthEndpoint.Mode.BEGIN)));
    assertFalse(acceptsCredentials(new PasskeyAuthEndpoint(PasskeyAuthEndpoint.Mode.FINISH)));
    // The recovery route especially: it is reached by somebody who has lost every other
    // way in, so accepting a password credential there would defeat the point twice over.
    assertFalse(acceptsCredentials(new MagicLinkSessionEndpoint()));
  }

  @Test public void theTwoCeremoniesAreDistinguishable() {
    // The ceremony code is part of the claim predicate, so a registration challenge cannot
    // be spent as an authentication one. If these ever collided that separation would
    // silently disappear.
    assertNotEquals(Ceremony.REGISTRATION.code(), Ceremony.AUTHENTICATION.code());
  }

  @Test public void theCeremonyCodesAreStable() {
    // Stored as an integer in a column, so reordering the enum would reinterpret every
    // outstanding challenge. Pinned so that reordering is a test failure rather than a
    // silent change of meaning.
    assertEquals(Ceremony.REGISTRATION.code(), 0);
    assertEquals(Ceremony.AUTHENTICATION.code(), 1);
  }
}
