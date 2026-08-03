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
import static org.testng.Assert.assertTrue;

import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.testng.annotations.Test;

/**
 * Covers the HTML fragments that go into signup alerts and reminders.
 *
 * <p>This markup is only ever seen inside an email client, so nothing in the
 * browser suites can catch it going wrong -- a reminder that lists the wrong
 * times, or every activity instead of the volunteer's, looks exactly like a
 * working one from the server's side.
 *
 * @author Caleb L. Power
 */
public class VolunteerSummaryTest {

  private static final UUID EVENT = UUID.randomUUID();

  private static Activity activity(String label) {
    return new Activity(UUID.randomUUID(), EVENT, label, "", 0, 0, 0);
  }

  private static Window window(long epochMillis) {
    return new Window(
        UUID.randomUUID(),
        EVENT,
        new Timestamp(epochMillis),
        new Timestamp(epochMillis + 3_600_000L));
  }

  @Test public void rsvpList_noClaims_isAnEmptyList() {
    String html = VolunteerSummary.rsvpList(List.of(activity("Setup")), List.of(window(0L)), Map.of(), null);
    assertEquals(html, "<ul></ul>");
  }

  @Test public void rsvpList_omitsActivitiesTheVolunteerDidNotClaim() {
    Activity claimed = activity("Setup");
    Activity skipped = activity("Teardown");
    Window w = window(0L);

    String html = VolunteerSummary.rsvpList(
        List.of(claimed, skipped),
        List.of(w),
        Map.of(claimed.getID(), Set.of(w.getID())),
        null);

    assertTrue(html.contains("Setup"));
    assertFalse(html.contains("Teardown"), "listed an activity they never signed up for");
  }

  @Test public void rsvpList_omitsWindowsTheVolunteerDidNotClaim() {
    Activity a = activity("Setup");
    Window claimed = window(0L);
    Window skipped = window(86_400_000L);

    String html = VolunteerSummary.rsvpList(
        List.of(a),
        List.of(claimed, skipped),
        Map.of(a.getID(), Set.of(claimed.getID())),
        null);

    // One <li> for the activity and exactly one for its single window.
    assertEquals(html.split("<li>", -1).length - 1, 2);
  }

  @Test public void rsvpList_followsTheEventsDisplayOrder() {
    // Not the order the claims arrived in: RSVPs come out of the database in no
    // meaningful order, and an email that lists a volunteer's shifts shuffled
    // is worse than useless to someone reading it in a hurry.
    Activity first = activity("Alpha");
    Activity second = activity("Beta");
    Window w = window(0L);

    Map<UUID, Set<UUID>> claims = new LinkedHashMap<>();
    claims.put(second.getID(), new LinkedHashSet<>(Set.of(w.getID())));
    claims.put(first.getID(), new LinkedHashSet<>(Set.of(w.getID())));

    String html = VolunteerSummary.rsvpList(List.of(first, second), List.of(w), claims, null);
    assertTrue(html.indexOf("Alpha") < html.indexOf("Beta"));
  }

  @Test public void rsvpList_groupsSeveralWindowsUnderOneActivity() {
    Activity a = activity("Setup");
    Window morning = window(0L);
    Window evening = window(43_200_000L);

    String html = VolunteerSummary.rsvpList(
        List.of(a),
        List.of(morning, evening),
        Map.of(a.getID(), new LinkedHashSet<>(List.of(morning.getID(), evening.getID()))),
        null);

    // The activity appears once, with a nested list of its two times.
    assertEquals(html.split("Setup", -1).length - 1, 1);
    assertEquals(html.split("<li>", -1).length - 1, 3);
  }

  @Test public void rsvpList_claimsForUnknownActivitiesAreIgnored() {
    // A stale claim -- an activity deleted between the signup and the reminder
    // -- must not appear and must not throw on the way past.
    Activity a = activity("Setup");
    Window w = window(0L);

    String html = VolunteerSummary.rsvpList(
        List.of(a),
        List.of(w),
        Map.of(UUID.randomUUID(), Set.of(w.getID())),
        null);

    assertEquals(html, "<ul></ul>");
  }

  @Test public void rsvpList_rendersTimesInTheEventsZone() {
    // The bug this closes: the grid rendered in the viewer's browser zone while
    // email rendered in the server's, so a volunteer elsewhere was told two
    // different times for the same shift. The event's own zone is the correct
    // one -- a shift at 9am local starts at 9am local for everybody.
    Activity a = activity("Setup");
    Window w = window(0L); // 1970-01-01T00:00:00Z

    String utc = VolunteerSummary.rsvpList(
        List.of(a), List.of(w), Map.of(a.getID(), Set.of(w.getID())), "UTC");
    String chicago = VolunteerSummary.rsvpList(
        List.of(a), List.of(w), Map.of(a.getID(), Set.of(w.getID())), "America/Chicago");

    assertTrue(utc.contains("12:00 AM"), "expected midnight UTC, got: " + utc);
    assertTrue(chicago.contains("06:00 PM"), "expected the previous evening, got: " + chicago);
  }

  @Test public void eventDate_rendersInTheEventsZone() {
    assertTrue(VolunteerSummary.eventDate(new Timestamp(0L), "UTC").startsWith("01/01/1970 12:00 AM"));
    // Same instant, a different wall clock, and the zone is named either way.
    assertTrue(
        VolunteerSummary.eventDate(new Timestamp(0L), "Asia/Tokyo").startsWith("01/01/1970 09:00 AM"));
  }

  @Test public void eventDate_namesItsTimezone() {
    // An event with no recorded zone -- every event predating the column --
    // still renders in the server's, as it always did. Naming the zone is the
    // minimum honesty owed to a recipient who may be reading it elsewhere.
    String rendered = VolunteerSummary.eventDate(new Timestamp(0L), null);
    assertTrue(
        rendered.matches("\\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2} [AP]M \\S+"),
        "unexpected format: " + rendered);
  }
}
