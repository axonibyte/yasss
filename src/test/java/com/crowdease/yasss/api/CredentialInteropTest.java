/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.UUID;

import com.axonibyte.lib.auth.Credentialed;

import org.json.JSONArray;
import org.json.JSONObject;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Verifies that credentials produced by the browser are accepted by the server.
 *
 * <p>The frontend derives an Ed25519 keypair from the user's password and signs
 * a credential payload; the server checks that signature against the public key
 * stored in {@code yasss_user.pubkey}. Those two implementations live in
 * different languages and different repositories' worth of dependencies, so
 * nothing but a test holds them together.
 *
 * <p>This matters more than a usual round-trip test: every existing account's
 * public key was derived by the legacy {@code axb-sig-req.min.js} bundle. If the
 * replacement ever derives something different, users are not shown an error --
 * they are silently locked out. The vectors in
 * {@code docs/legacy/creds-golden-vectors.json} are the frozen record of what
 * that bundle produced, cross-checked against {@code node:crypto}; this test
 * closes the loop by proving the Java verifier accepts them.
 *
 * @author Caleb L. Power
 */
public class CredentialInteropTest {

  private static final Path VECTORS = Path.of("docs", "legacy", "creds-golden-vectors.json");

  private static JSONArray loadVectors() throws Exception {
    return new JSONArray(Files.readString(VECTORS));
  }

  /**
   * Unpacks a vector's payload the way {@link AuthToken} does.
   *
   * @param payload the base64 {@code {creds, sig}} envelope
   * @return the decoded envelope
   */
  private static JSONObject unpack(String payload) {
    return new JSONObject(
        new String(Base64.getDecoder().decode(payload), java.nio.charset.StandardCharsets.UTF_8));
  }

  private static Credentialed credentialed(String pubkeyB64) {
    return new Credentialed(
        UUID.randomUUID(),
        Base64.getDecoder().decode(pubkeyB64),
        null,
        null);
  }

  @DataProvider(name = "vectors")
  public Object[][] vectors() throws Exception {
    JSONArray arr = loadVectors();
    Object[][] out = new Object[arr.length()][];
    for(int i = 0; i < arr.length(); i++) {
      JSONObject v = arr.getJSONObject(i);
      out[i] = new Object[] { v.getString("name"), v.getString("pubkey"), v.getString("payload") };
    }
    return out;
  }

  /**
   * The core claim: a signature the browser produced verifies against the
   * public key the browser registered.
   */
  @Test(dataProvider = "vectors")
  public void browserSignatureVerifies(String name, String pubkey, String payload) {
    JSONObject envelope = unpack(payload);
    assertTrue(
        credentialed(pubkey).verifySig(
            envelope.getString("creds"),
            envelope.getString("sig")),
        "signature from vector '" + name + "' was rejected by the Java verifier");
  }

  /**
   * The credential blob is raw JSON, not base64. {@code AuthToken.process} tries
   * base64-decoding it first and falls back to JSON parsing, so the shape here
   * is load-bearing -- and the key order is what gets signed.
   */
  @Test(dataProvider = "vectors")
  public void credsAreRawJsonWithEmailBeforeMfa(String name, String pubkey, String payload) {
    String creds = unpack(payload).getString("creds");
    assertTrue(creds.startsWith("{\"email\":"), "creds should lead with email: " + creds);
    assertTrue(creds.contains("\"mfa\":"), "creds should carry an mfa field: " + creds);

    JSONObject parsed = new JSONObject(creds);
    assertEquals(parsed.getString("mfa"), "", "every call site signs an empty mfa");
  }

  /** A tampered signature must not verify. */
  @Test
  public void tamperedSignatureIsRejected() throws Exception {
    JSONObject v = loadVectors().getJSONObject(0);
    JSONObject envelope = unpack(v.getString("payload"));

    byte[] sig = Base64.getDecoder().decode(envelope.getString("sig"));
    sig[0] ^= 0x01;

    assertFalse(
        credentialed(v.getString("pubkey")).verifySig(
            envelope.getString("creds"),
            Base64.getEncoder().encodeToString(sig)),
        "a flipped bit in the signature should not verify");
  }

  /** A signature must not verify against a different account's key. */
  @Test
  public void signatureDoesNotVerifyAgainstAnotherKey() throws Exception {
    JSONArray arr = loadVectors();
    JSONObject a = arr.getJSONObject(0);
    // 'ascii' and 'empty-password' derive from different passwords, so different keys
    JSONObject b = arr.getJSONObject(1);
    assertFalse(a.getString("pubkey").equals(b.getString("pubkey")), "vectors should differ");

    JSONObject envelope = unpack(a.getString("payload"));
    assertFalse(
        credentialed(b.getString("pubkey")).verifySig(
            envelope.getString("creds"),
            envelope.getString("sig")),
        "a signature should not verify under an unrelated public key");
  }

  /** Altering the signed credentials must invalidate the signature. */
  @Test
  public void alteredCredsAreRejected() throws Exception {
    JSONObject v = loadVectors().getJSONObject(0);
    JSONObject envelope = unpack(v.getString("payload"));

    assertFalse(
        credentialed(v.getString("pubkey")).verifySig(
            envelope.getString("creds").replace("\"mfa\":\"\"", "\"mfa\":\"000000\""),
            envelope.getString("sig")),
        "modified credentials should not verify");
  }
}
