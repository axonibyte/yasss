/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.security.SecureRandom;

/**
 * Short, human-copyable identifiers for events.
 *
 * <p>Eight characters, shown as {@code XXXX-XXXX}, usable anywhere an event's
 * {@link java.util.UUID} is. The point is the copying: a UUID is thirty-six
 * characters of hex and nobody reads one down a telephone or writes one on a
 * whiteboard.
 *
 * <h2>Alphabet</h2>
 *
 * <p>Crockford Base32 — {@code 0123456789ABCDEFGHJKMNPQRSTVWXYZ} — rather than
 * anything invented here. It already specifies exactly what is wanted: the
 * encoding alphabet omits {@code I}, {@code L}, {@code O} and {@code U}, and
 * decoding folds the characters people confuse into the ones that survive, so
 * {@code O} reads as zero and both {@code I} and {@code L} read as one. Reading
 * a code aloud and writing it down cannot produce a different code.
 *
 * <p>Excluding {@code U} is Crockford's, and it is worth keeping on a public
 * service: it makes an accidental obscenity in a randomly generated code very
 * much less likely.
 *
 * <p>Eight symbols is forty bits, about 1.1 trillion codes.
 *
 * <h2>Canonical form</h2>
 *
 * <p>Uppercase, no separator. That is what is stored and what is queried, so
 * the database's collation never enters into whether two codes are the same.
 * The hyphen exists only for display.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public final class EventCode {

  /** The encoding alphabet. Note the absent I, L, O and U. */
  private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();

  /** How many symbols a code has. */
  public static final int LENGTH = 8;

  private static final SecureRandom RANDOM = new SecureRandom();

  private EventCode() { }

  /**
   * Puts a user-supplied spelling of a code into canonical form.
   *
   * <p>In order: uppercase; fold the ambiguous characters; drop everything that
   * is not in the alphabet, which is what makes separators and stray
   * punctuation irrelevant. {@code abcd-efgh}, {@code ABCD EFGH},
   * {@code a.b.c.d.e.f.g.h} and {@code abcdefgh} are all the same code.
   *
   * <p>A character that is neither in the alphabet nor an ambiguity — {@code U}
   * is the only one — is dropped like any other stray, which leaves the result
   * too short and so invalid. That is the right outcome: it fails rather than
   * silently resolving to a different event.
   *
   * @param raw the code as the user typed, pasted or read it out
   * @return the canonical form, or {@code null} if it is not a code
   */
  public static String normalize(String raw) {
    if(null == raw) return null;

    StringBuilder sb = new StringBuilder(LENGTH);
    for(char c : raw.toUpperCase().toCharArray()) {
      char folded = switch(c) {
        case 'O' -> '0';
        case 'I', 'L' -> '1';
        default -> c;
      };
      if(0 <= indexOf(folded)) sb.append(folded);
    }

    return LENGTH == sb.length() ? sb.toString() : null;
  }

  /**
   * Whether a string is a code in any spelling.
   *
   * @param raw the candidate
   * @return {@code true} if {@link #normalize(String)} would accept it
   */
  public static boolean isCode(String raw) {
    return null != normalize(raw);
  }

  /**
   * Renders a canonical code for display.
   *
   * @param code the canonical code
   * @return the code as {@code XXXX-XXXX}, or {@code null} if there is none
   */
  public static String format(String code) {
    String canonical = normalize(code);
    if(null == canonical) return null;
    return canonical.substring(0, 4) + '-' + canonical.substring(4);
  }

  /**
   * Generates a fresh code.
   *
   * <p>{@link SecureRandom} rather than {@code Math.random}: a code is a
   * capability in the sense that anyone holding one can read the event, so
   * guessable codes would let someone walk the space. Forty bits is not a
   * secret, but it should not be a sequence either.
   *
   * @return a new canonical code
   */
  public static String generate() {
    StringBuilder sb = new StringBuilder(LENGTH);
    for(int i = 0; i < LENGTH; i++)
      sb.append(ALPHABET[RANDOM.nextInt(ALPHABET.length)]);
    return sb.toString();
  }

  private static int indexOf(char c) {
    for(int i = 0; i < ALPHABET.length; i++)
      if(ALPHABET[i] == c) return i;
    return -1;
  }
}
