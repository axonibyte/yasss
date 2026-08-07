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
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertThrows;
import static org.testng.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import com.crowdease.yasss.api.AuthToken.AuthException;
import com.crowdease.yasss.api.SigReqV2.Verdict;

import org.json.JSONObject;
import org.testng.annotations.Test;

/**
 * Covers parsing, canonicalisation and freshness of a v2 credential.
 *
 * <p>Pure and clock-injected, in the shape of {@code SessionTicketTest}: no database, no
 * network, so the boundaries can be walked exactly rather than approximately.
 *
 * @author Caleb L. Power
 */
public class SigReqV2Test {

  private static final String AUD = "yasss.example.org";
  private static final String JTI = "AAAAAAAAAAAAAAAAAAAAAA";
  private static final long NOW = 1_785_000_000_000L;
  private static final long SKEW = 5 * 60 * 1000L;

  private static String sub(String email) {
    return Base64.getUrlEncoder().withoutPadding()
        .encodeToString(email.getBytes(StandardCharsets.UTF_8));
  }

  /** A well-formed v2 credentials object. */
  private static JSONObject creds() {
    return new JSONObject()
        .put("v", 2)
        .put("aud", AUD)
        .put("sub", sub("bob@example.com"))
        .put("acct", "")
        .put("iat", Long.toString(NOW))
        .put("jti", JTI)
        .put("mfa", "");
  }

  // --- version discrimination -------------------------------------------------

  @Test public void anAbsentVersionIsV1() throws Exception {
    // Every existing client sends this, and so does every session ticket -- which is why
    // absent must mean v1 rather than being refused.
    assertFalse(SigReqV2.isV2(new JSONObject().put("email", "a@b.co").put("mfa", "")));
  }

  @Test public void aSessionTicketIsNotAV2Credential() throws Exception {
    assertFalse(SigReqV2.isV2(
        new JSONObject().put("account", "x").put("sat", 1).put("iat", 2)));
  }

  @Test public void anUnknownVersionIsRefusedRatherThanDowngraded() {
    // Treating v3 as v1 would silently undo whatever v3 added, which is the shape of
    // every protocol downgrade attack.
    assertThrows(AuthException.class, () -> SigReqV2.isV2(new JSONObject().put("v", 3)));
    assertThrows(AuthException.class, () -> SigReqV2.isV2(new JSONObject().put("v", 1)));
    assertThrows(AuthException.class, () -> SigReqV2.isV2(new JSONObject().put("v", "2")));
  }

  // --- parsing ---------------------------------------------------------------

  @Test public void aWellFormedCredentialParses() throws Exception {
    var c = SigReqV2.parse(creds());
    assertEquals(c.audience(), AUD);
    assertEquals(c.email(), "bob@example.com");
    assertEquals(c.issuedAt(), NOW);
    assertEquals(c.nonce(), JTI);
    assertEquals(c.mfa(), "");
  }

  @Test public void everyFieldIsRequired() {
    for(String field : new String[] { "aud", "sub", "acct", "iat", "jti", "mfa" }) {
      JSONObject partial = creds();
      partial.remove(field);
      assertThrows(
          AuthException.class,
          () -> SigReqV2.parse(partial));
    }
  }

  @Test public void aFieldOfTheWrongTypeIsMalformed() {
    // Not coerced. optString would turn a number into something that might match the
    // pattern, which would let a sender choose how their own field is read.
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("iat", NOW)));
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("mfa", 123456)));
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("aud", true)));
  }

  @Test public void aNewlineInAValueIsRefusedBeforeAnythingIsBuilt() {
    // The framing of the canonical message is LF, and it is unambiguous only because no
    // value can contain one. This is the check that makes that true.
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("aud", "a\nb=c")));
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("sub", "a\nb")));
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("mfa", "1\n2")));
  }

  @Test public void exactlyOneAddressingModeIsRequired() {
    // Neither names anybody; both are ambiguous.
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("sub", "")));
    assertThrows(
        AuthException.class,
        () -> SigReqV2.parse(
            creds().put("acct", "3f2b7c10-9a4d-4e61-8f03-2c5d8e7a1b44")));
  }

  @Test public void anAccountAddressedCredentialParses() throws Exception {
    var c = SigReqV2.parse(
        creds().put("sub", "").put("acct", "3f2b7c10-9a4d-4e61-8f03-2c5d8e7a1b44"));
    assertNull(c.email());
    assertEquals(c.account(), "3f2b7c10-9a4d-4e61-8f03-2c5d8e7a1b44");
  }

  @Test public void aMalformedNonceIsRefused() {
    // Exactly 22 base64url characters, which is 16 bytes. A shorter one would still be a
    // valid primary key and would quietly shrink the space an attacker has to avoid.
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("jti", "short")));
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("jti", JTI + "A")));
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("jti", "!".repeat(22))));
  }

  @Test public void aTimestampTooLargeForALongIsRefusedRatherThanThrown() {
    // The pattern permits 19 digits, which overflows. It must come back as a refusal, not
    // a NumberFormatException escaping into a 500.
    assertThrows(AuthException.class, () -> SigReqV2.parse(creds().put("iat", "9".repeat(19))));
  }

  // --- canonicalisation ------------------------------------------------------

  @Test public void theCanonicalMessageHasTheExpectedShape() throws Exception {
    String canonical = new String(
        SigReqV2.parse(creds()).canonicalBytes(), StandardCharsets.US_ASCII);

    assertEquals(
        canonical,
        "AXB-SIG-REQ/2\n"
        + "aud=" + AUD + "\n"
        + "sub=" + sub("bob@example.com") + "\n"
        + "acct=\n"
        + "iat=" + NOW + "\n"
        + "jti=" + JTI + "\n"
        + "mfa=\n");
  }

  @Test public void theCanonicalMessageIsAlwaysASCII() throws Exception {
    // The address goes over the wire base64url precisely so this holds: the signing
    // library hashes what it is handed, and an ASCII message removes any dependence on
    // how a non-ASCII address was encoded on the way in.
    byte[] bytes = SigReqV2.parse(
        creds().put("sub", sub("josé@example.com"))).canonicalBytes();

    for(byte b : bytes) assertTrue(b > 0 && b < 0x80, "byte " + b + " is not ASCII");
  }

  @Test public void everyFieldIsPresentEvenWhenEmpty() throws Exception {
    // JSON.stringify omits an undefined value, so a field that is sometimes there and
    // sometimes not changes the length of what is signed. Fixing the field set is what
    // makes the signed shape invariant.
    String canonical = new String(
        SigReqV2.parse(creds()).canonicalBytes(), StandardCharsets.US_ASCII);

    assertEquals(canonical.lines().count(), 7);
    assertTrue(canonical.contains("\nmfa=\n"), "an empty field still occupies its line");
  }

  @Test public void aDuplicateKeyIsRefusedByTheParser() {
    // Worth pinning because the design deliberately does NOT depend on it. This org.json
    // rejects a duplicated key rather than keeping the last, so the obvious
    // stale-iat/fresh-iat split is unavailable -- but that is one library's strictness,
    // and a bump could change it. The canonical reconstruction is what actually closes
    // the gap; this test exists so that if the parser ever does start accepting
    // duplicates, somebody finds out here rather than in production.
    assertThrows(
        org.json.JSONException.class,
        () -> new JSONObject(
            "{\"v\":2,\"iat\":\"1\",\"iat\":\"" + NOW + "\"}"));
  }

  @Test public void theSignedBytesFollowTheParsedValuesNotTheWireFormat() throws Exception {
    // The property that does the work: two JSON renderings of the same values -- reordered
    // keys, extra whitespace, an escaped character in the audience -- must produce the
    // same signed bytes, because the signature covers the reconstruction rather than the
    // text that arrived.
    JSONObject plain = new JSONObject(
        "{\"v\":2,\"aud\":\"" + AUD + "\",\"sub\":\"" + sub("bob@example.com") + "\","
        + "\"acct\":\"\",\"iat\":\"" + NOW + "\",\"jti\":\"" + JTI + "\",\"mfa\":\"\"}");

    JSONObject fussy = new JSONObject(
        "{ \"mfa\" : \"\" ,\n \"jti\":\"" + JTI + "\", \"iat\" : \"" + NOW + "\","
        + " \"acct\":\"\", \"sub\":\"" + sub("bob@example.com") + "\","
        + " \"aud\":\"yasss.example.\\u006frg\", \"v\":2 }");

    assertEquals(
        new String(SigReqV2.parse(fussy).canonicalBytes(), StandardCharsets.US_ASCII),
        new String(SigReqV2.parse(plain).canonicalBytes(), StandardCharsets.US_ASCII));
  }

  // --- freshness -------------------------------------------------------------

  @Test public void aCredentialAtTheCurrentInstantIsValid() throws Exception {
    assertEquals(SigReqV2.evaluate(SigReqV2.parse(creds()), NOW, SKEW), Verdict.VALID);
  }

  @Test public void theSkewBoundaryIsInclusive() throws Exception {
    var c = SigReqV2.parse(creds());
    assertEquals(SigReqV2.evaluate(c, NOW + SKEW, SKEW), Verdict.VALID);
    assertEquals(SigReqV2.evaluate(c, NOW - SKEW, SKEW), Verdict.VALID);
  }

  @Test public void oneMillisecondPastTheBoundaryIsNot() throws Exception {
    var c = SigReqV2.parse(creds());
    assertEquals(SigReqV2.evaluate(c, NOW + SKEW + 1, SKEW), Verdict.STALE);
    assertEquals(SigReqV2.evaluate(c, NOW - SKEW - 1, SKEW), Verdict.FUTURE);
  }

  @Test public void aWildlyFutureDatedCredentialIsRefused() throws Exception {
    // Otherwise a captured header dated a year out stays usable for a year.
    var c = SigReqV2.parse(creds());
    assertEquals(
        SigReqV2.evaluate(c, NOW - 365L * 24 * 60 * 60 * 1000, SKEW),
        Verdict.FUTURE);
  }
}
