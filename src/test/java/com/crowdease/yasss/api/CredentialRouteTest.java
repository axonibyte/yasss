/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.lang.reflect.Method;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.HTTPMethod;

import org.json.JSONObject;

import org.testng.annotations.Test;

import spark.Request;
import spark.Response;

/**
 * Pins which endpoints accept a password-derived credential.
 *
 * <p>The distinction matters more than the size of this file suggests. A session ticket
 * expires and answers to {@code session_epoch}; a password credential does neither, by
 * design, so that a platform-wide revoke forces a re-login rather than locking everyone
 * out permanently. The cost of that exemption is that a captured credential header is a
 * bearer token no revocation can withdraw — and for an account without MFA the signed
 * message is byte-identical forever, so capturing it once is enough.
 *
 * <p>So the set of endpoints that accept one is exactly the set that needs one, which is
 * the sign-in route and nothing else. This asserts that a new endpoint cannot join that
 * set by accident: {@code acceptsCredentials} defaults to {@code false} and has to be
 * overridden deliberately.
 *
 * @author Caleb L. Power
 */
public class CredentialRouteTest {

  /** Reads the protected predicate without needing a live request. */
  private static boolean acceptsCredentials(APIEndpoint endpoint) throws Exception {
    Method m = APIEndpoint.class.getDeclaredMethod("acceptsCredentials");
    m.setAccessible(true);
    return (boolean)m.invoke(endpoint);
  }

  @Test public void theSignInRouteAcceptsACredential() throws Exception {
    // GET /v1. There is no /login: authenticating against the version root is the
    // sign-in, and the client trades the credential for a ticket on the spot.
    assertTrue(acceptsCredentials(new APIInfoEndpoint()));
  }

  @Test public void ordinaryEndpointsDoNot() throws Exception {
    // A representative spread: reads, writes, and the two revocation routes, which are
    // the ones where accepting a credential would be most obviously wrong -- a captured
    // header could revoke the sessions of the account it was captured from.
    assertFalse(acceptsCredentials(new ListEventsEndpoint()));
    assertFalse(acceptsCredentials(new CreateEventEndpoint()));
    assertFalse(acceptsCredentials(new ModifyUserEndpoint()));
    for(RevokeSessionsEndpoint.Mode mode : RevokeSessionsEndpoint.Mode.values())
      assertFalse(acceptsCredentials(new RevokeSessionsEndpoint(mode)));
  }

  @Test public void theDefaultIsRefusal() throws Exception {
    // The property that keeps this true as endpoints are added: opting in is an explicit
    // override, so a new endpoint is safe unless somebody deliberately says otherwise.
    APIEndpoint fresh = new APIEndpoint(
        "test", APIVersion.VERSION_1, HTTPMethod.GET) {
      @Override public JSONObject onCall(Request req, Response res, Authorization auth) {
        return null;
      }
    };

    assertFalse(acceptsCredentials(fresh));
  }
}
