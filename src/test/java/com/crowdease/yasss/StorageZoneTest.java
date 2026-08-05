/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertNotEquals;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.TimeZone;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/**
 * Covers the pin that stops stored instants drifting.
 *
 * <p>Event times live in {@code DATETIME} columns, which carry no zone. The
 * JDBC driver renders a {@link Timestamp} — an instant — into one of those
 * using the JVM's default zone, and reads it back the same way. Verified
 * against a real MariaDB while this was written: the same instant stored as
 * {@code 12:00:00} under UTC, {@code 06:00:00} under America/Chicago and
 * {@code 21:00:00} under Asia/Tokyo. The round trip is symmetric in each, which
 * is exactly why nothing looks wrong until the zone moves.
 *
 * <p>So the JVM's zone is the storage format, and these pin it.
 *
 * @author Caleb L. Power
 */
public class StorageZoneTest {

  private TimeZone original;

  @BeforeMethod public void rememberZone() {
    original = TimeZone.getDefault();
  }

  @AfterMethod public void restoreZone() {
    // Process-global state. Leaving it changed would quietly alter every other
    // test in this JVM that touches a date.
    TimeZone.setDefault(original);
  }

  @Test public void pinsToUTC() {
    TimeZone.setDefault(TimeZone.getTimeZone("America/Chicago"));
    YasssCore.pinStorageZone();
    assertEquals(TimeZone.getDefault().getID(), "UTC");
  }

  @Test public void reportsWhatItReplaced() {
    // Returned so the caller can log it: an operator whose deployment was not
    // UTC needs to know their stored instants are now being read differently.
    TimeZone.setDefault(TimeZone.getTimeZone("Asia/Tokyo"));
    assertEquals(YasssCore.pinStorageZone().getID(), "Asia/Tokyo");
  }

  @Test public void isIdempotent() {
    YasssCore.pinStorageZone();
    assertEquals(YasssCore.pinStorageZone().getID(), "UTC");
    assertEquals(TimeZone.getDefault().getID(), "UTC");
  }

  @Test public void theZoneIsWhatRendersAnInstantForStorage() {
    // The mechanism itself, without a database. `Timestamp.toString()` renders
    // in the default zone, which is precisely what the driver does when it
    // builds the DATETIME literal it sends.
    Timestamp noon = Timestamp.from(Instant.parse("2026-01-15T12:00:00Z"));

    TimeZone.setDefault(TimeZone.getTimeZone("America/Chicago"));
    String chicago = noon.toString();

    YasssCore.pinStorageZone();
    String utc = noon.toString();

    assertNotEquals(
        chicago,
        utc,
        "if these matched, the default zone would not affect storage and the "
        + "pin would be pointless");
    assertEquals(utc, "2026-01-15 12:00:00.0");
    assertEquals(chicago, "2026-01-15 06:00:00.0");
  }

  @Test public void anInstantSurvivesTheRoundTripUnderThePin() {
    // What the pin buys: the same wall-clock reading always means the same
    // instant. Without it, a value written before a zone change reads back
    // shifted by the offset between the two.
    YasssCore.pinStorageZone();

    Instant original = Instant.parse("2026-07-04T09:30:00Z");
    Timestamp written = Timestamp.from(original);
    // What the column holds, and what a later read reconstructs from it.
    Timestamp readBack = Timestamp.valueOf(written.toString());

    assertEquals(readBack.toInstant(), original);
  }
}
