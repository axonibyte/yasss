/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertEquals;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.Security;
import java.util.Arrays;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import com.axonibyte.lib.auth.Credentialed;
import com.crowdease.yasss.model.CredentialMigrator.Decision;

import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.util.encoders.Base32;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/**
 * Covers the decision the boot sweep makes about each stored blob.
 *
 * <p>The SQL needs a database and the e2e suite exercises that; what is tested here is
 * the classification, which is where every interesting case lives and where a mistake is
 * expensive. Getting {@link Decision#UNREADABLE} wrong loses somebody's MFA enrollment;
 * getting {@link Decision#PLAINTEXT} wrong adopts a corrupt ciphertext as a secret.
 *
 * @author Caleb L. Power
 */
public class CredentialMigratorTest {

  private static final String SECRET = "a-real-secret-of-adequate-length";

  @BeforeMethod public void setUp() {
    Security.addProvider(new BouncyCastleProvider());
    Credentialed.setGlobalSecret(SECRET);
  }

  @AfterMethod public void tearDown() {
    Credentialed.setGlobalSecret(null);
  }

  private static Credentialed probe(UUID id) {
    return new Credentialed(id, null, null, null);
  }

  @Test public void aCurrentFormatRecordNeedsNothing() throws Exception {
    UUID id = UUID.randomUUID();
    var user = new Credentialed(id, null, null, null);
    user.regenerateMFAKey();

    assertEquals(
        CredentialMigrator.classify(probe(id), user.getEncMFASecret()),
        Decision.CURRENT);
  }

  @Test public void aLegacyRecordIsRecognized() throws Exception {
    UUID id = UUID.randomUUID();
    byte[] legacy = legacyEncrypt(id, secretBytes(), SECRET);

    assertEquals(CredentialMigrator.classify(probe(id), legacy), Decision.LEGACY);
  }

  @Test public void aLegacyRecordUnderTheWrongIDIsUnreadable() throws Exception {
    // The legacy format derives its IV from the entity ID, so a probe carrying the wrong
    // one cannot read it. Worth pinning: the sweep builds the probe from the row it read,
    // and if that ever stopped matching, every legacy record would be written off.
    byte[] legacy = legacyEncrypt(UUID.randomUUID(), secretBytes(), SECRET);

    assertEquals(
        CredentialMigrator.classify(probe(UUID.randomUUID()), legacy),
        Decision.UNREADABLE);
  }

  @Test public void aRecordUnderADifferentSecretIsUnreadable() throws Exception {
    UUID id = UUID.randomUUID();
    byte[] legacy = legacyEncrypt(id, secretBytes(), "an-entirely-different-secret");

    assertEquals(CredentialMigrator.classify(probe(id), legacy), Decision.UNREADABLE);
  }

  @Test public void anUnencryptedSecretIsRecognizedAsPlaintext() {
    // The recovery path for a deployment that ran with no ticket.globalSecret at all,
    // back when the library returned credential material unchanged. Those secrets sit in
    // the database in the clear and would otherwise be stranded permanently.
    UUID id = UUID.randomUUID();

    assertEquals(CredentialMigrator.classify(probe(id), secretBytes()), Decision.PLAINTEXT);
  }

  @Test public void anyUnreadableTwentyByteBlobIsTreatedAsPlaintext() {
    // States the residual risk rather than implying it away. The plaintext branch turns
    // on length alone -- a base32 round-trip was tried as a corroborating check and
    // removed, because base32 encodes arbitrary bytes and so every input passes it.
    //
    // What that costs: twenty bytes of corruption get adopted and re-encrypted as if they
    // were a TOTP secret. Which costs nothing real, because a blob that decrypts as
    // nothing is an enrollment that already does not work; the alternative is to strand it
    // and every genuinely-plaintext secret alongside it. The safety comes from the length
    // being unreachable by any ciphertext -- see the test below.
    UUID id = UUID.randomUUID();
    byte[] notASecret = new byte[20];
    Arrays.fill(notASecret, (byte)0xFF);

    assertEquals(CredentialMigrator.classify(probe(id), notASecret), Decision.PLAINTEXT);
  }

  @Test public void aCiphertextLengthIsNeverMistakenForPlaintext() throws Exception {
    // The lengths must not collide, or the heuristic above becomes dangerous. Legacy is
    // 36 bytes and current is 49; plaintext is 20.
    UUID id = UUID.randomUUID();
    assertEquals(legacyEncrypt(id, secretBytes(), SECRET).length, 36);

    var user = new Credentialed(id, null, null, null);
    user.regenerateMFAKey();
    assertEquals(user.getEncMFASecret().length, 49);
  }

  @Test public void aNullRecordNeedsNothing() {
    assertEquals(CredentialMigrator.classify(probe(UUID.randomUUID()), null), Decision.CURRENT);
  }

  @Test public void aTruncatedRecordIsUnreadable() {
    UUID id = UUID.randomUUID();
    byte[] truncated = new byte[8];

    assertEquals(CredentialMigrator.classify(probe(id), truncated), Decision.UNREADABLE);
  }

  /** Twenty bytes decoded from a real 32-character base32 secret. */
  private static byte[] secretBytes() {
    return Base32.decode("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567");
  }

  /** Reproduces the pre-0.1.0 on-disk format: AES-GCM, XOR-folded key, UUID as the IV. */
  private static byte[] legacyEncrypt(UUID id, byte[] plaintext, String secret)
      throws Exception {
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
