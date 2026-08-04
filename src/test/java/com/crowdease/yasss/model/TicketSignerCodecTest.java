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
import static org.testng.Assert.assertNotEquals;
import static org.testng.Assert.assertTrue;

import java.util.UUID;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.auth.CryptoException;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

/**
 * Covers the round trip that makes sessions survive a restart.
 *
 * <p>The most load-bearing test in this tier, because both things it pins fail
 * <em>silently</em>. A signer that does not survive the round trip does not
 * throw anywhere anyone would see: it simply stops verifying, {@code AuthToken}
 * reports a failure, {@code APIEndpoint.authenticate} swallows it, and every
 * request quietly becomes anonymous. And a signer persisted without a global
 * secret is not encrypted at all -- it looks exactly like one that is.
 *
 * <p>{@code Credentialed.setGlobalSecret} is process-global state, so every
 * method here restores it afterwards rather than leaving it set for whatever
 * runs next.
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

  @Test public void fails_underADifferentID() throws CryptoException {
    // The private key is AES-GCM encrypted with the signer's own UUID as the IV,
    // so the id is not a label -- it is part of the key material. Restoring
    // under any other id fails the GCM tag, and the only symptom in production
    // would be everybody silently becoming anonymous.
    Credentialed.setGlobalSecret(SECRET);

    Credentialed original = signer(UUID.randomUUID());
    Credentialed wrong = restored(UUID.randomUUID(), original);

    assertFalse(
        TicketSigner.usable(wrong),
        "a signer restored under the wrong id must be rejected, not trusted");
  }

  @Test public void fails_underADifferentSecret() throws CryptoException {
    // Rotating ticket.globalSecret invalidates every stored signer. That is
    // correct and unavoidable, but it must be detected at load rather than
    // discovered by users.
    UUID id = UUID.randomUUID();

    Credentialed.setGlobalSecret(SECRET);
    Credentialed original = signer(id);
    byte[] pubkey = original.getPubkey();
    byte[] privkey = original.getEncPrivkey();

    Credentialed.setGlobalSecret("an-entirely-different-secret");
    assertFalse(TicketSigner.usable(new Credentialed(id, pubkey, privkey, null)));
  }

  @Test public void withoutASecret_theStoredKeyIsNotEncrypted() throws CryptoException {
    // The reason persistenceAllowed exists, stated as an assertion rather than a
    // comment. With no global secret, Credentialed's crypto helper returns its
    // input unchanged, so getEncPrivkey() hands back the raw Ed25519 private
    // key. Writing that to a table means anyone who can read one table can mint
    // a session for any account.
    Credentialed.setGlobalSecret(null);

    Credentialed a = signer(UUID.randomUUID());
    byte[] stored = a.getEncPrivkey();

    // A raw Ed25519 private key is 32 bytes. AES-GCM ciphertext of one is 48:
    // the 32 bytes plus a 16-byte tag. The length alone tells you which of the
    // two is in the column.
    assertEquals(stored.length, 32, "an unencrypted Ed25519 private key");

    Credentialed.setGlobalSecret(SECRET);
    Credentialed b = signer(UUID.randomUUID());
    assertEquals(b.getEncPrivkey().length, 48, "AES-GCM ciphertext plus tag");

    assertNotEquals(stored.length, b.getEncPrivkey().length);
  }

  @Test public void persistenceAllowed_refusesEverythingButARealSecret() {
    assertFalse(TicketSigner.persistenceAllowed(null), "unset");
    assertFalse(TicketSigner.persistenceAllowed(""), "empty");
    assertFalse(TicketSigner.persistenceAllowed("   "), "blank");
    // Both placeholders defaults/yasss.cfg has carried. YasssCore copies that
    // file to disk on first boot, so a deployment that never edited it holds
    // one of these -- and they are in the public source tree, which makes them
    // exactly as good as no secret at all. The old one stays on the list
    // precisely because those are the deployments that never changed it.
    assertFalse(TicketSigner.persistenceAllowed("myGlobalSecret1!"), "the old placeholder");
    assertFalse(
        TicketSigner.persistenceAllowed("CHANGE-ME-to-a-long-random-string"),
        "the current placeholder");
    assertTrue(TicketSigner.persistenceAllowed(SECRET));
  }

  @Test public void usable_rejectsASignerWithNoKeys() {
    // What a restored row of NULLs, or a failed keypair generation, looks like.
    assertFalse(TicketSigner.usable(new Credentialed(UUID.randomUUID(), null, null, null)));
  }
}
