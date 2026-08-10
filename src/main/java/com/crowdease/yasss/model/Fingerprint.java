/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;

/**
 * Browser fingerprints, as used to make a second answer to a single-answer
 * {@link Poll} inconvenient.
 *
 * <p>The honest framing first, because it belongs in the code and not only in
 * the warning the organiser is shown: this is a speed bump. A determined person
 * with a second browser, a private window or a different machine defeats it in
 * seconds, and it is offered as "we will do our best" rather than as a
 * guarantee. What it does stop is the ordinary case — somebody clicking the
 * link again, or refreshing and voting twice by accident.
 *
 * <h2>Why the value is salted</h2>
 *
 * <p>The client sends a digest of its own signals; what gets stored is
 * {@code SHA-256(poll id ‖ digest)}. That costs one hash and buys the property
 * that matters: the same browser answering two different polls stores two
 * unrelated values, so this column cannot be joined to itself to follow a
 * person around the service. A duplicate check needs only to recognise a
 * repeat within one poll, and salting is what keeps it from quietly becoming
 * more than that.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public final class Fingerprint {

  /** Hex characters in a SHA-256 digest, which is what clients send. */
  public static final int HEX_LENGTH = 64;

  /** Bytes in a stored fingerprint. Matches {@code BINARY(32)}. */
  public static final int BYTE_LENGTH = 32;

  private Fingerprint() { }

  /**
   * Decodes a client-supplied digest.
   *
   * <p>Case-insensitive, because whether a client hex-encodes in upper or lower
   * case is an implementation detail of whichever helper it reached for, and
   * rejecting one of them would be a 400 that tells the caller nothing useful.
   * Length and alphabet are checked strictly: anything else is a client sending
   * something that is not a digest, and guessing at what it meant would put an
   * arbitrary caller-controlled value into an identity column.
   *
   * @param hex the digest as sent, or {@code null}
   * @return the {@value #BYTE_LENGTH} decoded bytes, or {@code null} if there
   *         was no digest or it was not one
   */
  public static byte[] parse(String hex) {
    if(null == hex || HEX_LENGTH != hex.length()) return null;

    byte[] out = new byte[BYTE_LENGTH];
    for(int i = 0; i < BYTE_LENGTH; i++) {
      int hi = digit(hex.charAt(i * 2));
      int lo = digit(hex.charAt(i * 2 + 1));
      if(0 > hi || 0 > lo) return null;
      out[i] = (byte)((hi << 4) | lo);
    }
    return out;
  }

  /**
   * Salts a client digest with the poll it was sent to.
   *
   * @param poll the {@link UUID} of the {@link Poll} being answered
   * @param digest the decoded client digest, or {@code null}
   * @return the {@value #BYTE_LENGTH} bytes to store, or {@code null} if there
   *         was no digest to salt
   */
  public static byte[] saltFor(UUID poll, byte[] digest) {
    if(null == poll || null == digest) return null;

    ByteBuffer id = ByteBuffer.allocate(16);
    id.putLong(poll.getMostSignificantBits());
    id.putLong(poll.getLeastSignificantBits());

    try {
      MessageDigest sha = MessageDigest.getInstance("SHA-256");
      sha.update(id.array());
      sha.update(digest);
      return sha.digest();
    } catch(NoSuchAlgorithmException e) {
      // SHA-256 is required of every conforming JRE, so this cannot happen; if
      // it somehow does, there is no sensible degraded behaviour -- returning
      // null would silently disable the duplicate check.
      throw new IllegalStateException("SHA-256 is unavailable", e);
    }
  }

  private static int digit(char c) {
    if('0' <= c && '9' >= c) return c - '0';
    if('a' <= c && 'f' >= c) return c - 'a' + 10;
    if('A' <= c && 'F' >= c) return c - 'A' + 10;
    return -1;
  }
}
