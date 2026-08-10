/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.expectThrows;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;

import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Times of day, as a poll's rows are stated.
 *
 * <p>The obvious implementation is {@link java.sql.Time#valueOf(String)}, and
 * it is wrong twice over: it accepts only {@code HH:mm:ss}, which is not the
 * format anybody sends, and it throws an unchecked
 * {@link IllegalArgumentException} on anything it dislikes -- so a caller
 * sending a malformed time would get a 500 out of a model constructor rather
 * than the 400 that describes what actually happened.
 *
 * @author Caleb L. Power
 */
public class ValidTimeTest {

  /** A tiny endpoint, purely to reach the protected helper under test. */
  private static final class Probe extends APIEndpoint {
    Probe() {
      super("/probe", APIVersion.VERSION_1, HTTPMethod.GET);
    }

    @Override public org.json.JSONObject onCall(
        spark.Request req, spark.Response res, Authorization auth) {
      return null;
    }

    java.sql.Time call(String value) throws EndpointException {
      return validTime(new FakeRequest(), value, "startTime");
    }
  }

  @DataProvider(name = "accepted")
  public Object[][] accepted() {
    return new Object[][] {
      { "00:00", "00:00:00" },
      { "09:00", "09:00:00" },
      { "13:30", "13:30:00" },
      { "23:59", "23:59:00" }
    };
  }

  @Test(dataProvider = "accepted")
  public void acceptsATimeOfDay(String raw, String stored) throws EndpointException {
    assertEquals(new Probe().call(raw).toString(), stored);
  }

  /**
   * Seconds are refused rather than ignored.
   *
   * <p>A poll asks about nine o'clock. A caller sending {@code 09:00:30} has
   * misunderstood something, and quietly discarding the seconds would leave
   * them believing it worked.
   */
  @DataProvider(name = "rejected")
  public Object[][] rejected() {
    return new Object[][] {
      { null },
      { "" },
      { "9:00" },        // unpadded
      { "09:00:00" },    // seconds
      { "24:00" },       // no such hour
      { "23:60" },       // no such minute
      { "-1:00" },
      { "+9:00" },
      { "09-00" },
      { "ab:cd" },
      { "09:0a" },
      { " 09:00" },
      { "09:00 " },
      { "09:00Z" }
    };
  }

  @Test(dataProvider = "rejected")
  public void refusesAnythingElse(String raw) {
    EndpointException e = expectThrows(EndpointException.class, () -> new Probe().call(raw));
    assertEquals(e.getErrorCode(), 400);
  }

  /**
   * The message names the argument, so a caller sending several times can tell
   * which one was wrong.
   *
   * <p>Read through {@code toString} rather than {@code getMessage}:
   * {@link EndpointException} keeps a generic sentence in the latter -- "an
   * EndpointException was thrown on ..." -- and surfaces the detail it was
   * given only in the former. Asserting on {@code getMessage} here passes
   * vacuously against any wording at all.
   */
  @Test public void theErrorNamesTheArgument() {
    EndpointException e = expectThrows(EndpointException.class, () -> new Probe().call("nope"));
    assertTrue(
        e.toString().contains("malformed argument (startTime)"),
        "exception was: " + e);
  }
}
