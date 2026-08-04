/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import java.sql.Timestamp;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import org.testng.annotations.Test;

/**
 * The model's natural orderings, which are load-bearing in a way that is easy
 * to miss.
 *
 * <p>{@code Event.getActivities}, {@code getDetails}, {@code getWindows} and
 * {@code ListUsersEndpoint} all collect into a {@link TreeSet}. A TreeSet
 * decides membership by the comparator alone, so any two rows a
 * {@code compareTo} calls equal become <em>one row</em> — accepted on the way
 * in, absent on the way out, and with nothing logged. Each of these four
 * comparators used to stop before it reached anything unique.
 *
 * @author Caleb L. Power
 */
public class OrderingTest {

  private static final UUID EVENT = UUID.randomUUID();

  private static Activity activity(String label) {
    return new Activity(UUID.randomUUID(), EVENT, label, "", 0, 0, 0);
  }

  private static Detail detail(String label) {
    return new Detail(UUID.randomUUID(), EVENT, Detail.Type.STRING, label, "", 0, false);
  }

  private static Window window(long begin, long end) {
    return new Window(UUID.randomUUID(), EVENT, new Timestamp(begin), new Timestamp(end));
  }

  // --- activities ------------------------------------------------------------

  @Test public void activitiesDifferingOnlyInCaseAreTwoActivities() {
    Set<Activity> set = new TreeSet<>();
    set.add(activity("Setup"));
    set.add(activity("setup"));
    assertEquals(set.size(), 2, "an event may legitimately have both");
  }

  @Test public void identicallyNamedActivitiesAreStillTwoActivities() {
    Set<Activity> set = new TreeSet<>();
    set.add(activity("Setup"));
    set.add(activity("Setup"));
    assertEquals(set.size(), 2);
  }

  @Test public void activitiesStillOrderByPriorityThenName() {
    // Priority is the last constructor argument, after the two caps.
    Activity urgent = new Activity(UUID.randomUUID(), EVENT, "Zebra", "", 0, 0, 0);
    Activity later = new Activity(UUID.randomUUID(), EVENT, "Apple", "", 0, 0, 1);
    Set<Activity> set = new TreeSet<>();
    set.add(later);
    set.add(urgent);
    // Priority wins over the label, as it always did.
    assertEquals(set.iterator().next().getShortDescription(), "Zebra");
  }

  @Test public void activitiesAtEqualPriorityStillOrderByName() {
    Set<Activity> set = new TreeSet<>();
    set.add(activity("Zebra"));
    set.add(activity("Apple"));
    assertEquals(set.iterator().next().getShortDescription(), "Apple");
  }

  // --- details ---------------------------------------------------------------

  @Test public void detailsSharingALabelAreTwoDetails() {
    Set<Detail> set = new TreeSet<>();
    set.add(detail("Notes"));
    set.add(detail("Notes"));
    assertEquals(set.size(), 2);
  }

  // --- windows ---------------------------------------------------------------

  /**
   * The comparator compared {@code this.begin} against the *other* window's
   * {@code end}, which is not a valid ordering: for two overlapping windows it
   * could report both A &lt; B and B &lt; A, and a TreeSet handed an
   * inconsistent comparator misplaces or loses elements rather than throwing.
   */
  @Test public void overlappingWindowsOrderConsistently() {
    Window a = window(0L, 10_000L);
    Window b = window(5_000L, 15_000L);

    assertTrue(a.compareTo(b) < 0, "the earlier window sorts first");
    assertTrue(b.compareTo(a) > 0, "and the comparison is antisymmetric");
  }

  @Test public void overlappingWindowsAllSurviveASet() {
    Set<Window> set = new TreeSet<>();
    set.add(window(0L, 10_000L));
    set.add(window(5_000L, 15_000L));
    set.add(window(7_000L, 9_000L));
    assertEquals(set.size(), 3);
  }

  @Test public void windowsSpanningTheSameRangeAreTwoWindows() {
    Set<Window> set = new TreeSet<>();
    set.add(window(0L, 10_000L));
    set.add(window(0L, 10_000L));
    assertEquals(set.size(), 2);
  }

  @Test public void windowsStillOrderByStart() {
    Set<Window> set = new TreeSet<>();
    set.add(window(20_000L, 30_000L));
    set.add(window(0L, 10_000L));
    assertEquals(set.iterator().next().getBeginTime().getTime(), 0L);
  }

  // --- users -----------------------------------------------------------------

  @Test public void accountsWithoutAnAddressAreNotAllTheSameAccount() {
    // Every unverified account before it sets an address. These all compared
    // equal, so the user listing reported one row for the lot of them.
    Set<User> set = new TreeSet<>();
    set.add(new User(UUID.randomUUID(), null, null, null, null, User.AccessLevel.UNVERIFIED));
    set.add(new User(UUID.randomUUID(), null, null, null, null, User.AccessLevel.UNVERIFIED));
    assertEquals(set.size(), 2);
  }

  @Test public void usersStillOrderByAddress() {
    Set<User> set = new TreeSet<>();
    set.add(new User(
        UUID.randomUUID(), null, null, "zoe@example.com", null, User.AccessLevel.STANDARD));
    set.add(new User(
        UUID.randomUUID(), null, null, "ada@example.com", null, User.AccessLevel.STANDARD));
    assertEquals(set.iterator().next().getEmail(), "ada@example.com");
  }

  // --- the shared tiebreaker -------------------------------------------------

  @Test public void uncommittedEntitiesCompareWithoutThrowing() {
    // `CreateEventEndpoint` sorts a whole list of details before any of them
    // has been committed, so every id in it is null.
    Detail a = new Detail(null, EVENT, Detail.Type.STRING, "Notes", "", 0, false);
    Detail b = new Detail(null, EVENT, Detail.Type.STRING, "Notes", "", 0, false);
    assertEquals(a.compareTo(b), 0);

    Detail committed = detail("Notes");
    assertTrue(a.compareTo(committed) < 0, "an unsaved entity sorts before a saved one");
    assertTrue(committed.compareTo(a) > 0);
  }
}
