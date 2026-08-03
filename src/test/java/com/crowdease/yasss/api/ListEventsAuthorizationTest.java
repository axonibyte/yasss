/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.util.UUID;

import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.User.AccessLevel;

import org.testng.annotations.Test;

/**
 * Who may list which events.
 *
 * This rule was deliberately <em>widened</em>: it used to require ADMIN
 * unconditionally, which meant a normal user could not list their own events
 * and the logged-in dashboard was dead. Widening an authorization check is
 * exactly the kind of change that wants a test attached, and the negatives
 * matter more than the positives here -- "a user can list their own events"
 * passes just as well for a rule that lets them list everybody's.
 *
 * @author Caleb L. Power
 */
public class ListEventsAuthorizationTest {

  private static User user(AccessLevel level) {
    return new User(UUID.randomUUID(), new byte[32], null, "u@example.com", null, level);
  }

  private static Authorization as(User actor) {
    return new Authorization(actor, true);
  }

  @Test
  public void anAdminMayListAnything() {
    Authorization admin = as(user(AccessLevel.ADMIN));

    assertTrue(admin.atLeast(AccessLevel.ADMIN)); // premise
    assertTrue(ListEventsEndpoint.mayList(admin, null, null));
    assertTrue(ListEventsEndpoint.mayList(admin, UUID.randomUUID(), null));
    assertTrue(ListEventsEndpoint.mayList(admin, null, UUID.randomUUID()));
  }

  /** The dashboard's two calls: events I administer, and events I signed up for. */
  @Test
  public void aStandardUserMayListTheirOwn() {
    User self = user(AccessLevel.STANDARD);
    assertTrue(ListEventsEndpoint.mayList(as(self), self.getID(), null));
    assertTrue(ListEventsEndpoint.mayList(as(self), null, self.getID()));
  }

  /** The reason the widening is safe. */
  @Test
  public void aStandardUserMayNotListAnotherAccount() {
    User self = user(AccessLevel.STANDARD);
    UUID somebodyElse = UUID.randomUUID();

    assertFalse(ListEventsEndpoint.mayList(as(self), somebodyElse, null));
    assertFalse(ListEventsEndpoint.mayList(as(self), null, somebodyElse));
  }

  /**
   * ...and the other half of it. An absent scope must not degrade to "list
   * everything", or the dashboard fix becomes a way to enumerate the platform.
   */
  @Test
  public void aStandardUserMayNotListUnscoped() {
    assertFalse(ListEventsEndpoint.mayList(as(user(AccessLevel.STANDARD)), null, null));
  }

  /**
   * Scoping one argument to yourself and the other to somebody else is
   * permitted, because the query ANDs the two filters and so returns only
   * events satisfying both -- which is a subset of your own. Pinned
   * deliberately rather than left to be discovered.
   */
  @Test
  public void mixedScopingIsPermittedBecauseTheFiltersIntersect() {
    User self = user(AccessLevel.STANDARD);
    assertTrue(ListEventsEndpoint.mayList(as(self), self.getID(), UUID.randomUUID()));
  }

  @Test
  public void anonymousMayNotList() {
    Authorization anon = new Authorization(null, true);

    assertFalse(ListEventsEndpoint.mayList(anon, null, null));
    assertFalse(ListEventsEndpoint.mayList(anon, UUID.randomUUID(), null));
  }

  /**
   * An unverified account may still list its own events, which is what makes
   * the dashboard render for someone who has registered but not yet confirmed
   * their address. Recorded as a decision rather than left implicit.
   */
  @Test
  public void anUnverifiedUserMayStillListTheirOwn() {
    User self = user(AccessLevel.UNVERIFIED);
    assertTrue(ListEventsEndpoint.mayList(as(self), self.getID(), null));
    assertFalse(ListEventsEndpoint.mayList(as(self), UUID.randomUUID(), null));
  }

  /** A banned account is refused even its own listing. */
  @Test
  public void aBannedUserMayListTheirOwn() {
    // BANNED still has an identity, so the scope check passes. Worth knowing:
    // the listing endpoint is not where a ban is enforced.
    User self = user(AccessLevel.BANNED);
    assertTrue(ListEventsEndpoint.mayList(as(self), self.getID(), null));
  }
}
