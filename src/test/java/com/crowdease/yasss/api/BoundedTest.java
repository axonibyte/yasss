/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertSame;
import static org.testng.Assert.expectThrows;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;

import org.testng.annotations.Test;

/**
 * The text-length bound, in characters rather than code units.
 *
 * <p>{@code VARCHAR(255)} counts characters; {@link String#length()} counts
 * UTF-16 code units. Everything outside the basic multilingual plane takes two
 * units per character, so measuring with {@code length()} refused a 200-emoji
 * value at a notional 400 despite it fitting the column twice over. The bound
 * is the only thing standing between a long value and a 500, so it has to
 * agree with the column about what it is counting.
 *
 * @author Caleb L. Power
 */
public class BoundedTest {

  /** A tiny endpoint, purely to reach the protected helper under test. */
  private static final class Probe extends APIEndpoint {
    Probe() {
      super("/probe", APIVersion.VERSION_1, HTTPMethod.GET);
    }

    @Override public org.json.JSONObject onCall(
        spark.Request req, spark.Response res, Authorization auth) {
      return null;
    }

    String call(String value) throws EndpointException {
      return bounded(new FakeRequest(), value, "field");
    }
  }

  private final Probe probe = new Probe();

  /** A string of {@code count} astral-plane characters, two code units each. */
  private static String astral(int count) {
    return "🎉".repeat(count); // U+1F389 PARTY POPPER
  }

  @Test public void nullPassesThrough() throws Exception {
    assertNull(probe.call(null));
  }

  @Test public void returnsItsArgumentUnchanged() throws Exception {
    String value = "unchanged";
    assertSame(probe.call(value), value);
  }

  @Test public void acceptsExactlyTheColumnWidth() throws Exception {
    assertEquals(probe.call("a".repeat(255)).length(), 255);
  }

  @Test public void refusesOneCharacterOver() {
    EndpointException e = expectThrows(EndpointException.class, () -> probe.call("a".repeat(256)));
    assertEquals(e.getErrorCode(), 400);
  }

  /**
   * The regression this exists for: 255 astral characters is 510 code units,
   * and it fits.
   */
  @Test public void acceptsTheColumnWidthInAstralCharacters() throws Exception {
    String value = astral(255);
    assertEquals(value.length(), 510, "the fixture should be two code units per character");
    assertSame(probe.call(value), value);
  }

  @Test public void refusesOneAstralCharacterOver() {
    expectThrows(EndpointException.class, () -> probe.call(astral(256)));
  }

  /**
   * Combining marks are separate characters to both Java and the column, so
   * "e" plus four of them occupies five of the 255 -- which is what MariaDB
   * will store, and therefore what the bound must count.
   */
  @Test public void countsCombiningMarksSeparately() throws Exception {
    String value = "é̂̃̄".repeat(51); // 5 chars x 51 = 255
    assertEquals(value.codePointCount(0, value.length()), 255);
    assertSame(probe.call(value), value);
    expectThrows(EndpointException.class, () -> probe.call(value + "x"));
  }
}
