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
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertTrue;

import java.util.HashSet;
import java.util.Set;

import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Short event codes.
 *
 * <p>The normalisation is the whole feature: a code is meant to survive being
 * read aloud, written on a whiteboard and typed back in, so every spelling a
 * human might produce has to resolve to the same eight symbols. If it does not,
 * someone is sent to the wrong event or to none at all.
 *
 * <p>The shared corpus at the bottom is mirrored in
 * {@code frontend/tests/unit/eventCode.test.js}. Two implementations of one rule
 * is a drift hazard, and this is the same arrangement {@code DetailTypeTest} and
 * {@code CredentialInteropTest} already use.
 *
 * @author Caleb L. Power
 */
public class EventCodeTest {

  @Test public void generatesEightSymbolsFromTheAlphabet() {
    for(int i = 0; i < 200; i++) {
      String code = EventCode.generate();
      assertEquals(code.length(), EventCode.LENGTH);
      assertEquals(EventCode.normalize(code), code, "generated codes must already be canonical");
    }
  }

  /**
   * The alphabet excludes I, L, O and U. The first three because they are
   * confusable with 1, 1 and 0; the fourth is Crockford's, and it makes an
   * accidental obscenity in a random code very much less likely.
   */
  @Test public void neverGeneratesAnAmbiguousCharacter() {
    for(int i = 0; i < 500; i++)
      for(char c : EventCode.generate().toCharArray())
        assertFalse(
            'I' == c || 'L' == c || 'O' == c || 'U' == c,
            "generated a confusable character: " + c);
  }

  @Test public void generatesDistinctCodes() {
    // Not a statistical claim -- just that it is not a constant or a counter.
    Set<String> seen = new HashSet<>();
    for(int i = 0; i < 500; i++) seen.add(EventCode.generate());
    assertTrue(seen.size() > 490, "only " + seen.size() + " distinct codes in 500");
  }

  @Test public void formatsWithAHyphen() {
    assertEquals(EventCode.format("ABCDEFGH"), "ABCD-EFGH");
    // The hyphen is presentation only, so formatting is idempotent through it.
    assertEquals(EventCode.format("ABCD-EFGH"), "ABCD-EFGH");
    // Deliberately not "too short" -- that folds to T00SH0RT, which is eight
    // valid symbols and a perfectly good code. A nice demonstration that the
    // dropping rule is doing real work.
    assertNull(EventCode.format("abc"));
  }

  @Test public void wrongLengthsAreNotCodes() {
    assertNull(EventCode.normalize(""));
    assertNull(EventCode.normalize("ABCDEFG"));
    assertNull(EventCode.normalize("ABCDEFGHJ"));
    assertNull(EventCode.normalize(null));
    // A UUID normalises to far more than eight, so the two can never collide.
    assertNull(EventCode.normalize("f81d4fae-7dec-11d0-a765-00a0c91e6bf6"));
  }

  /**
   * U is in neither the alphabet nor the ambiguity table, so it is dropped like
   * any other stray character and the result comes up short. Failing is the
   * right outcome — better than silently resolving to some other event.
   */
  @Test public void aStrayUMakesTheCodeInvalidRatherThanDifferent() {
    assertNull(EventCode.normalize("ABCDEFGU"));
    assertNotEquals(EventCode.normalize("ABCDEFGH"), EventCode.normalize("ABCDEFGU"));
  }

  // --- the shared corpus -----------------------------------------------------

  /**
   * Each row is a spelling and what it must normalise to. Keep in step with
   * {@code frontend/tests/unit/eventCode.test.js}.
   */
  @DataProvider(name = "corpus")
  public Object[][] corpus() {
    return new Object[][] {
      // spelling,                 canonical
      { "ABCD-EFGH",               "ABCDEFGH" },
      { "ABCDEFGH",                "ABCDEFGH" },
      { "abcd-efgh",               "ABCDEFGH" },
      { "AbCd-EfGh",               "ABCDEFGH" },
      { "ABCD EFGH",               "ABCDEFGH" },
      { "  ABCD-EFGH  ",           "ABCDEFGH" },
      { "a.b.c.d.e.f.g.h",         "ABCDEFGH" },
      { "ABCD_EFGH",               "ABCDEFGH" },
      { "A-B-C-D-E-F-G-H",         "ABCDEFGH" },

      // The ambiguity folding, which is the point of the alphabet.
      { "O0O0-1111",               "00001111" },
      { "o0o0-illi",               "00001111" },
      { "I1I1-L1L1",               "11111111" },
      { "0OoO-1IiL",               "00001111" },

      // Not codes.
      { "",                        null },
      { "ABCDEFG",                 null },
      { "ABCDEFGHJ",               null },
      { "ABCDEFGU",                null },
      { "--------",                null },
      { "f81d4fae-7dec-11d0-a765-00a0c91e6bf6", null },
    };
  }

  @Test(dataProvider = "corpus")
  public void theSharedCorpusAgreesWithTheFrontend(String spelling, String canonical) {
    assertEquals(
        EventCode.normalize(spelling),
        canonical,
        String.format("normalize(\"%s\") -- keep this row in step with "
            + "frontend/tests/unit/eventCode.test.js", spelling));
  }
}
