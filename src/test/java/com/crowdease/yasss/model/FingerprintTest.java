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
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertNull;

import java.util.Arrays;
import java.util.UUID;

import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Browser fingerprints, as stored against a single-answer poll.
 *
 * <p>Two properties matter here and nothing else does. A digest that is not a
 * digest must be rejected rather than guessed at, because whatever survives
 * lands in an identity column that decides who is turned away. And the stored
 * value must be salted per poll, because the difference between a duplicate
 * check and a tracking database is entirely whether the same browser is
 * recognisable across two polls.
 *
 * @author Caleb L. Power
 */
public class FingerprintTest {

  /** A real SHA-256, of the empty string. */
  private static final String VALID =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  @Test public void parsesACanonicalDigest() {
    byte[] parsed = Fingerprint.parse(VALID);
    assertNotNull(parsed);
    assertEquals(parsed.length, Fingerprint.BYTE_LENGTH);
    assertEquals(parsed[0], (byte)0xe3);
    assertEquals(parsed[Fingerprint.BYTE_LENGTH - 1], (byte)0x55);
  }

  /**
   * Whether a client hex-encodes in upper or lower case is an implementation
   * detail of whichever helper it reached for, and a 400 over it tells the
   * caller nothing useful.
   */
  @Test public void acceptsEitherCase() {
    assertEquals(
        Fingerprint.parse(VALID.toUpperCase()),
        Fingerprint.parse(VALID));
  }

  @DataProvider(name = "notADigest")
  public Object[][] notADigest() {
    return new Object[][] {
      { null },
      { "" },
      { VALID.substring(0, 63) },
      { VALID + "0" },
      { VALID.substring(0, 63) + "g" },
      { VALID.substring(0, 62) + "  " },
      { "'; DROP TABLE poll_response; " },
      { VALID.substring(0, 60) + "    " }
    };
  }

  /**
   * Anything that is not a digest is refused outright rather than truncated,
   * padded or otherwise repaired. A repaired value is a caller-controlled value
   * in a column that decides whether somebody may answer.
   */
  @Test(dataProvider = "notADigest")
  public void refusesAnythingThatIsNotADigest(String candidate) {
    assertNull(Fingerprint.parse(candidate));
  }

  @Test public void saltingIsStableForOnePoll() {
    UUID poll = UUID.randomUUID();
    byte[] digest = Fingerprint.parse(VALID);
    assertEquals(
        Fingerprint.saltFor(poll, digest),
        Fingerprint.saltFor(poll, digest),
        "the same browser must be recognisable within one poll");
  }

  /**
   * The property the salt exists for: one browser answering two polls stores
   * two unrelated values, so this column cannot be joined to itself to follow a
   * person around the service.
   */
  @Test public void saltingDiffersAcrossPolls() {
    byte[] digest = Fingerprint.parse(VALID);
    byte[] here = Fingerprint.saltFor(UUID.randomUUID(), digest);
    byte[] there = Fingerprint.saltFor(UUID.randomUUID(), digest);
    assertFalse(
        Arrays.equals(here, there),
        "the same browser was linkable across two polls");
  }

  @Test public void saltingDiffersAcrossBrowsers() {
    UUID poll = UUID.randomUUID();
    byte[] here = Fingerprint.saltFor(poll, Fingerprint.parse(VALID));
    byte[] there = Fingerprint.saltFor(
        poll,
        Fingerprint.parse(
            "0000000000000000000000000000000000000000000000000000000000000001"));
    assertFalse(Arrays.equals(here, there));
  }

  @Test public void saltedValuesFitTheColumn() {
    byte[] salted = Fingerprint.saltFor(UUID.randomUUID(), Fingerprint.parse(VALID));
    assertEquals(salted.length, Fingerprint.BYTE_LENGTH);
  }

  /**
   * A browser that produced no digest must still be able to answer -- a
   * hardened profile refusing a canvas read is a person, not an attack -- so
   * the absent case travels as null rather than as an exception.
   */
  @Test public void nothingInNothingOut() {
    assertNull(Fingerprint.saltFor(UUID.randomUUID(), null));
    assertNull(Fingerprint.saltFor(null, Fingerprint.parse(VALID)));
    assertNull(Fingerprint.saltFor(null, null));
  }

  /** The stored value must not be the digest the client sent. */
  @Test public void theClientDigestIsNeverWhatIsStored() {
    byte[] digest = Fingerprint.parse(VALID);
    assertFalse(
        Arrays.equals(digest, Fingerprint.saltFor(UUID.randomUUID(), digest)));
  }
}
