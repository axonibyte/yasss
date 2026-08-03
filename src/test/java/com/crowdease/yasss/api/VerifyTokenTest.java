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

import java.util.UUID;

import com.axonibyte.lib.auth.CryptoException;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.User.AccessLevel;

import org.testng.annotations.Test;

/**
 * Covers the account-verification token comparison.
 *
 * <p>The link this guards used to be signed by the {@code TicketEngine}, whose
 * signers roll on a roughly fifteen-minute horizon and are lost on restart --
 * so a verification email was effectively dead on arrival and new accounts
 * could not be activated at all. The replacement is a stored token, which moves
 * the whole question onto this comparison.
 *
 * <p>Two of these are the ones that matter: a cleared token must match nothing,
 * or a used link could be replayed against a later address; and a malformed
 * token must be a quiet {@code false} rather than an exception, since the value
 * arrives straight from a URL.
 *
 * @author Caleb L. Power
 */
public class VerifyTokenTest {

  private static User user(UUID token) throws CryptoException {
    User user = new User(
        "pending@example.com",
        AccessLevel.UNVERIFIED,
        // 32 zero bytes, base64 -- a structurally valid Ed25519 public key.
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    return user.setVerifyToken(token);
  }

  @Test public void matches_theStoredToken() throws CryptoException {
    UUID token = UUID.randomUUID();
    assertTrue(VerifyUserEndpoint.tokenMatches(user(token), token.toString()));
  }

  @Test public void matches_isCaseInsensitiveOnHex() throws CryptoException {
    // Mail clients and URL handlers do fold case; UUID.fromString accepts both,
    // and the comparison is on the parsed value rather than the text.
    UUID token = UUID.randomUUID();
    assertTrue(
        VerifyUserEndpoint.tokenMatches(user(token), token.toString().toUpperCase()));
  }

  @Test public void rejects_aDifferentToken() throws CryptoException {
    assertFalse(
        VerifyUserEndpoint.tokenMatches(
            user(UUID.randomUUID()),
            UUID.randomUUID().toString()));
  }

  @Test public void rejects_whenNoVerificationIsOutstanding() throws CryptoException {
    // The load-bearing one. Verifying clears the token, so a link that has
    // already been used must not verify a later pending address.
    assertFalse(
        VerifyUserEndpoint.tokenMatches(user(null), UUID.randomUUID().toString()));
  }

  @Test public void rejects_aMalformedToken() throws CryptoException {
    // Straight off a URL, so this is ordinary input, not an edge case.
    User u = user(UUID.randomUUID());
    for(String bad : new String[] { "", "not-a-uuid", "../../etc/passwd", "null" }) {
      assertFalse(VerifyUserEndpoint.tokenMatches(u, bad), "should have rejected: " + bad);
    }
  }

  @Test public void rejects_anAbsentToken() throws CryptoException {
    assertFalse(VerifyUserEndpoint.tokenMatches(user(UUID.randomUUID()), null));
  }

  @Test public void rejects_bothAbsent() throws CryptoException {
    // Neither side present must not read as a match.
    assertFalse(VerifyUserEndpoint.tokenMatches(user(null), null));
  }
}
