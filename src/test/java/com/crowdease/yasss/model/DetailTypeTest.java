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
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertTrue;

import com.crowdease.yasss.model.Detail.Type;

import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * The custom-field type patterns.
 *
 * These decide what a volunteer is allowed to type, and the frontend mirrors
 * them in {@code frontend/src/lib/validation/patterns.js} so the user gets an
 * inline message instead of an opaque 400. Two independent copies of a rule is
 * a drift hazard, and the failure mode is nasty in both directions: the client
 * refusing input the server would accept, or accepting input the server then
 * rejects with a message that names a field rather than a reason.
 *
 * So the important test here is the last one -- a shared corpus asserting the
 * two tiers agree, in the same spirit as {@code CredentialInteropTest} pinning
 * the crypto across languages.
 *
 * All of these are applied with {@code matcher.matches()}, i.e. implicitly
 * anchored at both ends, and compiled without {@code CASE_INSENSITIVE}.
 *
 * @author Caleb L. Power
 */
public class DetailTypeTest {

  /** Anything at all, including across lines. */
  @Test
  public void stringAcceptsAnything() {
    assertTrue(Type.STRING.isValid(""));
    assertTrue(Type.STRING.isValid("   "));
    assertTrue(Type.STRING.isValid("anything at all: <>&\"'"));

    // This used to be false and was recorded here as a known surprise: `.`
    // excludes line terminators, so `.*` under `matches()` refused a multi-line
    // answer with a 400 while the event title, activity label and every other
    // free-text field took one happily. Pasting a multi-line answer is the
    // ordinary way to reach it, and the type means "any string", so the pattern
    // now says so -- `(?s).*`.
    assertTrue(Type.STRING.isValid("two\nlines"));
    assertTrue(Type.STRING.isValid("\r\n"));
    assertTrue(Type.STRING.isValid("🎉\nemoji across lines"));
  }

  @Test
  public void booleanIsExactlyTrueOrFalse() {
    assertTrue(Type.BOOLEAN.isValid("true"));
    assertTrue(Type.BOOLEAN.isValid("false"));

    assertFalse(Type.BOOLEAN.isValid("TRUE"));
    assertFalse(Type.BOOLEAN.isValid("yes"));
    assertFalse(Type.BOOLEAN.isValid("1"));
    assertFalse(Type.BOOLEAN.isValid(""));
  }

  /**
   * Named "Whole Number" in the UI, but the pattern permits up to nine decimal
   * places and forbids a sign. The client's message says "number" rather than
   * "integer" precisely because of this.
   */
  @Test
  public void integerIsNeitherWholeNorSigned() {
    assertTrue(Type.INTEGER.isValid("0"));
    assertTrue(Type.INTEGER.isValid("42"));
    assertTrue(Type.INTEGER.isValid("1.5"));
    assertTrue(Type.INTEGER.isValid("1.123456789"));

    assertFalse(Type.INTEGER.isValid("-1"));
    assertFalse(Type.INTEGER.isValid("1.1234567891")); // ten decimals
    assertFalse(Type.INTEGER.isValid("abc12"));
    assertFalse(Type.INTEGER.isValid(""));
  }

  /**
   * The character class is lowercase-only, so an address with any capital
   * letter is rejected. Genuine server behavior, not a client quirk -- the
   * frontend lowercases on blur rather than loosening the rule, which keeps the
   * two tiers in agreement while removing the trap.
   */
  @Test
  public void emailIsLowercaseOnly() {
    assertTrue(Type.EMAIL.isValid("bob@example.com"));
    assertTrue(Type.EMAIL.isValid("bob.smith+tag@sub.example.co.uk"));

    assertFalse(Type.EMAIL.isValid("Bob@example.com"));
    assertFalse(Type.EMAIL.isValid("bob@Example.com"));
    assertFalse(Type.EMAIL.isValid("BOB@EXAMPLE.COM"));
  }

  /** Anchoring means surrounding text is not tolerated. */
  @Test
  public void emailIsAnchored() {
    assertFalse(Type.EMAIL.isValid("hello bob@example.com world"));
    assertFalse(Type.EMAIL.isValid(" bob@example.com"));
    assertFalse(Type.EMAIL.isValid("bob@example.com "));
  }

  @Test
  public void phoneAcceptsTheCommonForms() {
    assertTrue(Type.PHONE.isValid("5555555555"));
    assertTrue(Type.PHONE.isValid("555-555-5555"));
    assertTrue(Type.PHONE.isValid("(555) 555-5555"));
    assertTrue(Type.PHONE.isValid("+1 555 555 5555"));

    assertFalse(Type.PHONE.isValid("call me"));
    assertFalse(Type.PHONE.isValid("555-5555"));
    assertFalse(Type.PHONE.isValid(""));
  }

  /**
   * The shared corpus.
   *
   * Each row is a value, the type to validate it as, and the verdict both tiers
   * must reach. The mirror of this table lives in
   * {@code frontend/tests/unit/validation.test.js}; if these two ever disagree,
   * one of the copies has drifted and a user is being told something untrue.
   */
  @DataProvider(name = "corpus")
  public Object[][] corpus() {
    return new Object[][] {
      // value,                     type,          valid
      { "bob@example.com",          Type.EMAIL,    true  },
      { "Bob@Example.com",          Type.EMAIL,    false },
      { "hello bob@example.com x",  Type.EMAIL,    false },
      { "not-an-email",             Type.EMAIL,    false },
      { "",                         Type.EMAIL,    false },

      { "42",                       Type.INTEGER,  true  },
      { "1.5",                      Type.INTEGER,  true  },
      { "-1",                       Type.INTEGER,  false },
      { "abc12",                    Type.INTEGER,  false },
      { "",                         Type.INTEGER,  false },

      { "555-555-5555",             Type.PHONE,    true  },
      { "(555) 555-5555",           Type.PHONE,    true  },
      { "call me at 5555555555",    Type.PHONE,    false },
      { "",                         Type.PHONE,    false },

      { "true",                     Type.BOOLEAN,  true  },
      { "false",                    Type.BOOLEAN,  true  },
      { "TRUE",                     Type.BOOLEAN,  false },
      { "yes",                      Type.BOOLEAN,  false },

      { "anything",                 Type.STRING,   true  },
      { "",                         Type.STRING,   true  },
    };
  }

  @Test(dataProvider = "corpus")
  public void theSharedCorpusAgreesWithTheFrontend(String value, Type type, boolean valid) {
    assertEquals(
        type.isValid(value),
        valid,
        String.format("%s.isValid(\"%s\") -- keep this row in step with "
            + "frontend/tests/unit/validation.test.js", type, value));
  }

  // --- normalization ---------------------------------------------------------

  /**
   * The EMAIL pattern is lowercase-only, mirroring a Java pattern compiled
   * without CASE_INSENSITIVE. Validating a raw answer therefore rejected every
   * address with a capital letter in it — which is most of the ones people
   * type. `normalize` is what the four call sites now run first.
   */
  @Test
  public void emailNormalizesToLowercase() {
    assertEquals(Type.EMAIL.normalize("John.Smith@Example.COM"), "john.smith@example.com");
    assertTrue(Type.EMAIL.isValid(Type.EMAIL.normalize("John.Smith@Example.COM")));
    // The case that used to be a 400.
    assertFalse(Type.EMAIL.isValid("John.Smith@Example.COM"));
  }

  /** Every other type is left exactly alone; case can be meaningful in them. */
  @Test
  public void otherTypesAreNotTouched() {
    assertEquals(Type.STRING.normalize("MiXeD Case"), "MiXeD Case");
    assertEquals(Type.INTEGER.normalize("42"), "42");
    assertEquals(Type.BOOLEAN.normalize("true"), "true");
    assertEquals(Type.PHONE.normalize("555-0100"), "555-0100");
  }

  @Test
  public void normalizeToleratesNull() {
    for(Type type : Type.values()) assertNull(type.normalize(null));
  }
}
