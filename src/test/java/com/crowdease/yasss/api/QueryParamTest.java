/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertThrows;
import static org.testng.Assert.expectThrows;
import static org.testng.Assert.assertTrue;

import com.axonibyte.lib.http.rest.EndpointException;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.testng.annotations.Test;

/**
 * Query-parameter handling.
 *
 * {@code deserializeQueryParams} necessarily stores every value as a
 * {@link String}, while {@code JSONDeserializer.getInt} casts to
 * {@link Integer}. Reading a numeric query argument the ordinary way therefore
 * throws a {@link ClassCastException} and surfaces as a baffling 400 -- which
 * is what {@code ?page=} and {@code ?limit=} both did on the event and user
 * listings. {@code APIEndpoint.queryInt} exists solely to close that, and
 * nothing verified it until now.
 *
 * @author Caleb L. Power
 */
public class QueryParamTest {

  /** A tiny endpoint, purely to reach the protected helpers under test. */
  private static final class Probe extends APIEndpoint {
    Probe() {
      super("/probe", com.axonibyte.lib.http.APIVersion.VERSION_1,
          com.axonibyte.lib.http.rest.HTTPMethod.GET);
    }

    @Override public org.json.JSONObject onCall(
        spark.Request req, spark.Response res, Authorization auth) {
      return null;
    }

    JSONDeserializer deserialize(spark.Request req) throws Exception {
      return deserializeQueryParams(req);
    }

    int readInt(spark.Request req, JSONDeserializer d, String token) throws EndpointException {
      return queryInt(req, d, token, Integer.MAX_VALUE);
    }

    int readInt(spark.Request req, JSONDeserializer d, String token, int max)
        throws EndpointException {
      return queryInt(req, d, token, max);
    }
  }

  private static final Probe PROBE = new Probe();

  private static JSONDeserializer deserialized(FakeRequest req, String... tokens) throws Exception {
    JSONDeserializer d = PROBE.deserialize(req);
    for(String token : tokens) d = d.tokenize(token, false);
    return d.check();
  }

  @Test
  public void aSingleValueIsStoredAsAScalar() throws Exception {
    FakeRequest req = new FakeRequest().query("limit", "5");
    JSONDeserializer d = deserialized(req, "limit");

    assertTrue(d.has("limit"));
    assertEquals(PROBE.readInt(req, d, "limit"), 5);
  }

  /**
   * The whole reason queryInt exists: the value is a String, so the ordinary
   * getInt path cannot read it.
   *
   * Note it surfaces as a DeserializationException rather than the underlying
   * ClassCastException -- getInt catches and rethrows -- which is precisely why
   * the symptom was an unhelpful "malformed argument (int: limit)" 400 on a
   * perfectly well-formed request.
   */
  @Test
  public void getIntCannotReadAQueryParameter() throws Exception {
    FakeRequest req = new FakeRequest().query("limit", "5");
    JSONDeserializer d = deserialized(req, "limit");

    DeserializationException e = expectThrows(
        DeserializationException.class, () -> d.getInt("limit"));
    assertTrue(
        e.getMessage().contains("malformed argument (int: limit)"),
        "message was: " + e.getMessage());
  }

  @Test
  public void aNonNumericValueIsA400() throws Exception {
    FakeRequest req = new FakeRequest().query("limit", "abc");
    JSONDeserializer d = deserialized(req, "limit");

    EndpointException e = expectThrows(
        EndpointException.class, () -> PROBE.readInt(req, d, "limit"));
    assertEquals(e.getErrorCode(), 400);
  }

  /** Pagination is one-based, so zero and negatives are refused. */
  @Test
  public void nonPositiveValuesAreRefused() throws Exception {
    for(String value : new String[] { "0", "-1" }) {
      FakeRequest req = new FakeRequest().query("page", value);
      JSONDeserializer d = deserialized(req, "page");
      EndpointException e = expectThrows(
          EndpointException.class, () -> PROBE.readInt(req, d, "page"));
      assertEquals(e.getErrorCode(), 400, "page=" + value + " should be a 400");
    }
  }

  /** A fractional value is not an integer, however numeric it looks. */
  @Test
  public void fractionalValuesAreRefused() throws Exception {
    FakeRequest req = new FakeRequest().query("limit", "1.5");
    JSONDeserializer d = deserialized(req, "limit");

    assertThrows(EndpointException.class, () -> PROBE.readInt(req, d, "limit"));
  }

  /** Surrounding whitespace survives the URL and should not be fatal. */
  @Test
  public void surroundingWhitespaceIsTolerated() throws Exception {
    FakeRequest req = new FakeRequest().query("limit", " 7 ");
    JSONDeserializer d = deserialized(req, "limit");

    assertEquals(PROBE.readInt(req, d, "limit"), 7);
  }

  /** An unregistered parameter is rejected rather than ignored. */
  @Test
  public void anUnexpectedParameterIsRejected() {
    FakeRequest req = new FakeRequest().query("surprise", "1");
    assertThrows(Exception.class, () -> deserialized(req, "limit"));
  }

  /** A repeated parameter arrives as an array rather than collapsing. */
  @Test
  public void repeatedParametersBecomeAnArray() throws Exception {
    FakeRequest req = new FakeRequest().query("label", "a", "b");
    JSONDeserializer d = deserialized(req, "label");

    assertTrue(d.has("label"));
    // Reported as a deserialization failure rather than a raw cast error.
    assertThrows(DeserializationException.class, () -> d.getString("label"));
  }

  // --- timezone validation -------------------------------------------------

  @Test public void validTimezone_acceptsIanaIdentifiers() throws EndpointException {
    for(String zone : new String[] { "UTC", "America/Chicago", "Europe/London", "Asia/Tokyo" })
      assertEquals(APIEndpoint.validTimezone(new FakeRequest(), zone), zone);
  }

  @Test public void validTimezone_rejectsNonsense() {
    // Checked against the JVM's own tz database rather than a pattern, because
    // every renderer downstream hands it straight to ZoneId. A plausible name
    // that is not in the database would otherwise fail inside an email.
    for(String bad : new String[] { "Mars/Olympus_Mons", "america/chicago", "", "EST5EDT7" })
      expectThrows(
          EndpointException.class,
          () -> APIEndpoint.validTimezone(new FakeRequest(), bad));
  }

  @Test public void validTimezone_rejectsBareOffsets() {
    // An offset is wrong for half the year anywhere observing DST, and events
    // are routinely scheduled across a transition.
    for(String offset : new String[] { "+05:00", "-06:00", "GMT+2" })
      expectThrows(
          EndpointException.class,
          () -> APIEndpoint.validTimezone(new FakeRequest(), offset));
  }

  @Test public void validTimezone_rejectsNull() {
    expectThrows(
        EndpointException.class,
        () -> APIEndpoint.validTimezone(new FakeRequest(), null));
  }

  // --- reminder lead time --------------------------------------------------

  @Test public void validLeadTime_acceptsSensibleValues() throws EndpointException {
    for(int m : new int[] { 1, 60, 1440, APIEndpoint.MAX_LEAD_MINUTES })
      assertEquals(APIEndpoint.validLeadTime(new FakeRequest(), m), m);
  }

  @Test public void validLeadTime_rejectsZeroAndNegatives() {
    // Zero would mean "remind them as the event begins", which is not a
    // reminder; a negative is nonsense the column cannot even hold.
    for(int m : new int[] { 0, -1, Integer.MIN_VALUE })
      expectThrows(
          EndpointException.class,
          () -> APIEndpoint.validLeadTime(new FakeRequest(), m));
  }

  @Test public void validLeadTime_rejectsAnUnboundedValue() {
    // An unbounded lead makes every future event permanently due, so the first
    // sweep after it is set mails the entire backlog at once.
    for(int m : new int[] { APIEndpoint.MAX_LEAD_MINUTES + 1, Integer.MAX_VALUE })
      expectThrows(
          EndpointException.class,
          () -> APIEndpoint.validLeadTime(new FakeRequest(), m));
  }

  /**
   * The ceiling, which did not exist.
   *
   * Listing endpoints compute `limit * (page - 1)` as a SQL offset and
   * `page * limit` for the next-page link. Unbounded, `?limit=2000000000`
   * overflows int into a *negative* offset, the query fails, and a plain client
   * mistake comes back as a 500. A cap also stops one request asking MariaDB to
   * materialise an entire table into a Set.
   */
  @Test
  public void queryIntRejectsAnythingAboveTheCeiling() throws Exception {
    FakeRequest req = new FakeRequest().query("limit", "201");
    JSONDeserializer d = deserialized(req, "limit");
    EndpointException e = expectThrows(
        EndpointException.class,
        () -> PROBE.readInt(req, d, "limit", APIEndpoint.MAX_PAGE_SIZE));
    assertEquals(e.getErrorCode(), 400);
  }

  @Test
  public void queryIntAcceptsTheCeilingItself() throws Exception {
    FakeRequest req = new FakeRequest().query("limit", "200");
    JSONDeserializer d = deserialized(req, "limit");
    assertEquals(PROBE.readInt(req, d, "limit", APIEndpoint.MAX_PAGE_SIZE), 200);
  }

  /** The pair the four listing call sites actually multiply together. */
  @Test
  public void theShippedBoundsCannotOverflowWhenMultiplied() {
    long product = (long)APIEndpoint.MAX_PAGE * (long)APIEndpoint.MAX_PAGE_SIZE;
    assertTrue(
        product <= Integer.MAX_VALUE,
        "MAX_PAGE * MAX_PAGE_SIZE must fit an int: " + product);
  }
}
