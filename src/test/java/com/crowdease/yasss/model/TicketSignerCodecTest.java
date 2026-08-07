/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertThrows;
import static org.testng.Assert.assertTrue;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.Security;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.auth.CryptoException;

import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

/**
 * Covers the round trip that makes sessions survive a restart.
 *
 * <p>The most load-bearing test in this tier, because what it pins fails <em>silently</em>.
 * A signer that does not survive the round trip does not throw anywhere anyone would see:
 * it simply stops verifying, {@code AuthToken} reports a failure,
 * {@code APIEndpoint.authenticate} swallows it, and every request quietly becomes
 * anonymous.
 *
 * <p>Two of these tests changed meaning at {@code axb-lib-auth-java} 0.1.0 and are worth
 * reading before trusting the others:
 *
 * <ul>
 *   <li>The signer's {@link UUID} is <em>no longer key material</em> for a current-format
 *       record. The IV is random and travels inside the blob, so a signer restored under
 *       any id decrypts fine. Ids must still round-trip exactly, but for a different
 *       reason -- the ticket names its signer and {@code TicketEngine.verify} looks it up
 *       by id -- and it is {@code TicketEngineKidTest} that now catches a mistake there,
 *       not {@code load}.</li>
 *   <li>There is no longer any such thing as an unencrypted stored key. With no global
 *       secret the library refuses to generate a keypair at all, so the hazard
 *       {@code persistenceAllowed} was written against cannot arise by that route.</li>
 * </ul>
 *
 * <p>{@code Credentialed.setGlobalSecret} is process-global state, so every method here
 * restores it afterwards rather than leaving it set for whatever runs next.
 *
 * @author Caleb L. Power
 */
public class TicketSignerCodecTest {

  private static final String SECRET = "a-real-secret-of-adequate-length";

  @AfterMethod public void clearGlobalSecret() {
    Credentialed.setGlobalSecret(null);
  }

  /** A freshly generated signer, exactly as the engine makes one. */
  private static Credentialed signer(UUID id) throws CryptoException {
    Credentialed signer = new Credentialed(id, null, null, null);
    signer.regenerateKeypair();
    return signer;
  }

  /** A signer rebuilt from stored columns, exactly as {@code load} makes one. */
  private static Credentialed restored(UUID id, Credentialed from) {
    return new Credentialed(id, from.getPubkey(), from.getEncPrivkey(), null);
  }

  @Test public void restores_underTheSameID() throws CryptoException {
    Credentialed.setGlobalSecret(SECRET);

    UUID id = UUID.randomUUID();
    Credentialed original = signer(id);
    String signature = original.sign("a message");

    Credentialed restored = restored(id, original);

    assertTrue(
        restored.verifySig("a message", signature),
        "a restored signer must verify what the original signed");
    assertTrue(
        original.verifySig("another message", restored.sign("another message")),
        "and must still be able to sign");
    assertTrue(TicketSigner.usable(restored));
  }

  @Test public void restores_underADifferentID_becauseTheIDIsNoLongerKeyMaterial()
      throws CryptoException {
    // This used to be the tripwire: the private key was AES-GCM encrypted with the
    // signer's own UUID as the IV, so restoring under any other id failed the tag. Since
    // the random-IV format the nonce travels in the blob and the id is not consulted, so
    // this now succeeds. Asserted rather than deleted, because the change is easy to miss
    // and someone will otherwise assume load() still catches a swapped id.
    Credentialed.setGlobalSecret(SECRET);

    Credentialed original = signer(UUID.randomUUID());

    assertTrue(
        TicketSigner.usable(restored(UUID.randomUUID(), original)),
        "a current-format signer no longer depends on its id to decrypt");
  }

  @Test public void fails_underADifferentID_forLegacyRecords() throws Exception {
    // The legacy path still derives the IV from the id, so a row written before the
    // format change is still keyed to it. This is what the upgrade has to keep working.
    Credentialed.setGlobalSecret(SECRET);

    UUID id = UUID.randomUUID();
    byte[] rawPrivkey = new byte[32];
    java.util.Arrays.fill(rawPrivkey, (byte)0x11);
    byte[] legacyBlob = legacyEncrypt(id, rawPrivkey, SECRET);

    assertFalse(
        TicketSigner.usable(new Credentialed(UUID.randomUUID(), new byte[32], legacyBlob, null)),
        "a legacy signer restored under the wrong id must be rejected, not trusted");
  }

  @Test public void fails_underADifferentSecret() throws CryptoException {
    // Rotating ticket.globalSecret invalidates every stored signer. That is correct and
    // unavoidable, but it must be detected at load rather than discovered by users.
    UUID id = UUID.randomUUID();

    Credentialed.setGlobalSecret(SECRET);
    Credentialed original = signer(id);
    byte[] pubkey = original.getPubkey();
    byte[] privkey = original.getEncPrivkey();

    Credentialed.setGlobalSecret("an-entirely-different-secret");
    assertFalse(TicketSigner.usable(new Credentialed(id, pubkey, privkey, null)));
  }

  @Test public void fails_underADifferentSecret_forLegacyRecords() throws Exception {
    UUID id = UUID.randomUUID();
    byte[] legacyBlob = legacyEncrypt(id, new byte[32], SECRET);

    Credentialed.setGlobalSecret("an-entirely-different-secret");
    assertFalse(TicketSigner.usable(new Credentialed(id, new byte[32], legacyBlob, null)));
  }

  @Test public void withoutASecret_keyGenerationFailsClosed() {
    // Replaces withoutASecret_theStoredKeyIsNotEncrypted, whose premise is gone. That
    // test asserted the library handed back a raw 32-byte Ed25519 private key when no
    // secret was configured -- which is exactly why persistenceAllowed had to exist. The
    // key is now never produced at all, so there is nothing to keep out of the table by
    // that route.
    Credentialed.setGlobalSecret(null);

    assertThrows(CryptoException.class, () -> signer(UUID.randomUUID()));
  }

  @Test public void withASecret_theStoredKeyIsVersionedCiphertext() throws CryptoException {
    Credentialed.setGlobalSecret(SECRET);

    byte[] stored = signer(UUID.randomUUID()).getEncPrivkey();

    // [1-byte version][12-byte nonce][32-byte ciphertext][16-byte tag].
    assertEquals(stored.length, 61, "versioned AES-GCM ciphertext plus tag");
    assertEquals(stored[0], 0x01, "format marker");
    // ticket_signer.privkey is VARBINARY(255). Asserted so that a future format change
    // fails here rather than silently truncating on the way into the column.
    assertTrue(stored.length < 255, "must fit the column it is stored in");
  }

  @Test public void legacySigner_stillLoadsAfterTheUpgrade() throws Exception {
    // The compatibility claim, and the only place it is checked anywhere: a row written
    // by 0.0.2 must still sign and verify, or the deploy that takes this library signs
    // out every user on the platform at once. e2e cannot cover it -- every run starts
    // from an empty database, so every stored blob is written by the build under test.
    //
    // The legacy ciphertext is reproduced here rather than imported from the library's
    // own test, deliberately: the point is to assert the claim against whatever the
    // library actually ships, without trusting the library's account of itself.
    Credentialed.setGlobalSecret(SECRET);

    UUID id = UUID.randomUUID();
    Credentialed current = signer(id);

    // Take a real keypair, strip it back to the raw private key, and re-encrypt it the
    // way 0.0.2 would have.
    byte[] rawPrivkey = rawPrivkeyOf(current);
    byte[] legacyBlob = legacyEncrypt(id, rawPrivkey, SECRET);

    Credentialed legacy = new Credentialed(id, current.getPubkey(), legacyBlob, null);

    assertTrue(
        TicketSigner.usable(legacy),
        "a signer stored before the format change must still round-trip");
    assertTrue(
        current.verifySig("a message", legacy.sign("a message")),
        "and must produce signatures the current-format copy verifies");
  }

  @Test public void persistenceAllowed_refusesEverythingButARealSecret() {
    assertFalse(TicketSigner.persistenceAllowed(null), "unset");
    assertFalse(TicketSigner.persistenceAllowed(""), "empty");
    assertFalse(TicketSigner.persistenceAllowed("   "), "blank");
    // Both placeholders defaults/yasss.cfg has carried. YasssCore copies that file to
    // disk on first boot, so a deployment that never edited it holds one of these. They
    // are in the public source tree, so a signer encrypted under one is encrypted under a
    // key anybody can read -- which is what this check is for now that the library no
    // longer writes anything in the clear. The old one stays on the list precisely
    // because those are the deployments that never changed it.
    assertFalse(TicketSigner.persistenceAllowed("myGlobalSecret1!"), "the old placeholder");
    assertFalse(
        TicketSigner.persistenceAllowed("CHANGE-ME-to-a-long-random-string"),
        "the current placeholder");
    assertTrue(TicketSigner.persistenceAllowed(SECRET));
  }

  @Test public void usable_rejectsASignerWithNoKeys() {
    // What a restored row of NULLs, or a failed keypair generation, looks like.
    Credentialed.setGlobalSecret(SECRET);
    assertFalse(TicketSigner.usable(new Credentialed(UUID.randomUUID(), null, null, null)));
  }

  /** Recovers the plaintext Ed25519 private key from a current-format signer. */
  private static byte[] rawPrivkeyOf(Credentialed signer) throws Exception {
    Security.addProvider(new BouncyCastleProvider());

    byte[] blob = signer.getEncPrivkey();
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding", "BC");
    cipher.init(
        Cipher.DECRYPT_MODE,
        new SecretKeySpec(hkdf(SECRET), "AES"),
        new javax.crypto.spec.GCMParameterSpec(128, java.util.Arrays.copyOfRange(blob, 1, 13)));
    return cipher.doFinal(blob, 13, blob.length - 13);
  }

  /** The library's current at-rest key derivation, reproduced. */
  private static byte[] hkdf(String secret) {
    var hkdf = new org.bouncycastle.crypto.generators.HKDFBytesGenerator(
        new org.bouncycastle.crypto.digests.SHA256Digest());
    hkdf.init(
        new org.bouncycastle.crypto.params.HKDFParameters(
            secret.getBytes(StandardCharsets.UTF_8),
            "axb-lib-auth:credentialed".getBytes(StandardCharsets.UTF_8),
            "at-rest-key:v1".getBytes(StandardCharsets.UTF_8)));
    byte[] out = new byte[32];
    hkdf.generateBytes(out, 0, out.length);
    return out;
  }

  /** Reproduces the pre-0.1.0 on-disk format: AES-GCM, XOR-folded key, UUID as the IV. */
  private static byte[] legacyEncrypt(UUID id, byte[] plaintext, String secret)
      throws Exception {
    Security.addProvider(new BouncyCastleProvider());

    byte[] buf = secret.getBytes(StandardCharsets.UTF_8);
    byte[] key = new byte[32];
    for(int i = 0; i < Math.max(key.length, buf.length); i++)
      key[i % key.length] ^= buf[i % buf.length];

    ByteBuffer idBuf = ByteBuffer.wrap(new byte[16]);
    idBuf.putLong(id.getMostSignificantBits());
    idBuf.putLong(id.getLeastSignificantBits());

    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding", "BC");
    cipher.init(
        Cipher.ENCRYPT_MODE,
        new SecretKeySpec(key, "AES"),
        new IvParameterSpec(idBuf.array()));
    return cipher.doFinal(plaintext);
  }
}
