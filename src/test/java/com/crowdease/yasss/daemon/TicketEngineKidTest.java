/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.daemon;

import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.util.UUID;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.auth.CryptoException;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

/**
 * Covers signer identity, which used to be enforced somewhere else.
 *
 * <p>Before {@code axb-lib-auth-java} 0.1.0 a signer's {@link UUID} was the AES-GCM IV
 * for its own private key, so restoring one under the wrong id failed the tag check and
 * {@code TicketSigner.load}'s probe threw it out. That made {@code TicketSignerCodecTest}
 * the place ids were checked, incidentally.
 *
 * <p>The IV is now random and travels inside the stored blob, so the id is no longer key
 * material and a mis-restored signer decrypts perfectly well. Ids still have to be exact,
 * because a session ticket names the signer that produced it and {@link TicketEngine#verify}
 * resolves it by id -- but nothing about decryption enforces that any more. This is where
 * it is enforced now.
 *
 * @author Caleb L. Power
 */
public class TicketEngineKidTest {

  private static final String SECRET = "a-real-secret-of-adequate-length";

  /** A day between rotations, fifteen retained, thirty days of sessions -- the shipped shape. */
  private static TicketEngine engine() {
    return new TicketEngine(1440, 15, 30 * 24 * 60, false);
  }

  @AfterMethod public void clearGlobalSecret() {
    Credentialed.setGlobalSecret(null);
  }

  @Test public void aTicketVerifiesUnderTheSignerThatProducedIt() throws CryptoException {
    Credentialed.setGlobalSecret(SECRET);

    TicketEngine engine = engine();
    engine.start();
    try {
      var signature = engine.sign("a message");
      assertTrue(engine.verify("a message", signature.value(), signature.signerID()));
    } finally {
      engine.stop();
    }
  }

  @Test public void aTicketNamingAnUnknownSignerIsRefused() throws CryptoException {
    // The failure that load() used to catch by accident. A signature is perfectly valid
    // here -- it just claims to come from a signer this engine has never held, and the
    // lookup must refuse it rather than scanning the history until something matches.
    Credentialed.setGlobalSecret(SECRET);

    TicketEngine engine = engine();
    engine.start();
    try {
      var signature = engine.sign("a message");
      assertFalse(
          engine.verify("a message", signature.value(), UUID.randomUUID()),
          "a ticket naming a signer we do not hold must not verify");
    } finally {
      engine.stop();
    }
  }

  @Test public void aTicketWithNoSignerNamedIsRefused() throws CryptoException {
    // Tickets issued before signers were named carry no kid. They are dead rather than
    // grandfathered, which costs one forced sign-in and avoids a scan.
    Credentialed.setGlobalSecret(SECRET);

    TicketEngine engine = engine();
    engine.start();
    try {
      var signature = engine.sign("a message");
      assertFalse(engine.verify("a message", signature.value(), null));
    } finally {
      engine.stop();
    }
  }

  @Test public void aTamperedMessageIsRefusedUnderTheRightSigner() throws CryptoException {
    Credentialed.setGlobalSecret(SECRET);

    TicketEngine engine = engine();
    engine.start();
    try {
      var signature = engine.sign("a message");
      assertFalse(engine.verify("a different message", signature.value(), signature.signerID()));
    } finally {
      engine.stop();
    }
  }

}
