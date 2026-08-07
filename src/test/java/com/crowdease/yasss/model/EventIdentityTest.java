/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotEquals;
import static org.testng.Assert.assertTrue;

import java.sql.Timestamp;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

import org.testng.annotations.Test;

/**
 * Event identity, and the deduplication the listing endpoints depend on.
 *
 * <p>{@code Event.getEvents} returns a {@link Set}, which reads as a guarantee that an
 * event appears at most once. It was not one: {@code Event} defined no equality, so the
 * {@link LinkedHashSet} deduplicated by object identity while every result row built a
 * fresh instance. The volunteer-scoped query inner-joins the volunteer table, so an
 * account holding more than one signup on an event -- which {@code allow_multiuser_signups}
 * exists to permit -- got that event back once per signup.
 *
 * <p>The frontend keys its dashboard list on the event id, so the repeat crashed the
 * render outright with {@code each_key_duplicate} rather than merely showing the event
 * twice.
 *
 * @author Caleb L. Power
 */
public class EventIdentityTest {

  private static Event event(UUID id, String label) {
    return new Event(
        id, UUID.randomUUID(), label, "", new Timestamp(0L), false, false, true);
  }

  @Test public void sameIdIsTheSameEvent() {
    UUID id = UUID.randomUUID();
    // Deliberately different in every field but the id: these stand for two rows
    // of the same event arriving through a join, not two copies of one object.
    Event first = event(id, "Bake Sale");
    Event second = event(id, "Bake Sale (renamed since)");

    assertEquals(first, second);
    assertEquals(first.hashCode(), second.hashCode());
  }

  @Test public void differentIdsAreDifferentEvents() {
    assertNotEquals(event(UUID.randomUUID(), "A"), event(UUID.randomUUID(), "A"));
  }

  @Test public void aSetCollapsesRepeatsOfOneEvent() {
    UUID id = UUID.randomUUID();
    Set<Event> events = new LinkedHashSet<>();

    // What the volunteer join produces for an account with three signups.
    events.add(event(id, "Bake Sale"));
    events.add(event(id, "Bake Sale"));
    events.add(event(id, "Bake Sale"));

    assertEquals(events.size(), 1);
  }

  @Test public void aSetStillKeepsGenuinelyDistinctEvents() {
    Set<Event> events = new LinkedHashSet<>();
    events.add(event(UUID.randomUUID(), "Bake Sale"));
    events.add(event(UUID.randomUUID(), "Car Wash"));

    assertEquals(events.size(), 2);
  }

  /**
   * An event that has never been committed has no id to be identified by, so it is
   * equal only to itself -- otherwise every unsaved event would collapse into one.
   */
  @Test public void uncommittedEventsAreEqualOnlyToThemselves() {
    Event first = event(null, "Draft");
    Event second = event(null, "Draft");

    assertTrue(first.equals(first));
    assertFalse(first.equals(second));

    Set<Event> events = new LinkedHashSet<>();
    events.add(first);
    events.add(second);
    assertEquals(events.size(), 2);
  }

  @Test public void anEventIsNotEqualToOtherThings() {
    Event e = event(UUID.randomUUID(), "Bake Sale");
    assertFalse(e.equals(null));
    assertFalse(e.equals("not an event"));
  }
}
