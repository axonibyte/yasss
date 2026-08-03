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

import java.sql.Timestamp;
import java.util.UUID;

import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.User.AccessLevel;

import org.testng.annotations.Test;

/**
 * The authorization rules, exhaustively.
 *
 * Every endpoint in the application defers to {@link Authorization}, and until
 * now nothing verified it. Several of the rules encoded here are load-bearing
 * for behaviour the product depends on and are written down nowhere else --
 * notably that an event with no administrator is editable only by a platform
 * admin, which is the entire reason "publish anonymously and you can never edit
 * it again" is true.
 *
 * No mocking and no database: {@code Authorization}'s constructor is
 * package-private and these tests sit in-package, {@link User} and {@link Event}
 * have public side-effect-free constructors, and {@code YasssCore.authRequired}
 * is {@code true} at field initialisation so the checks are live with no setup.
 *
 * @author Caleb L. Power
 */
public class AuthorizationMatrixTest {

  private static User user(AccessLevel level) {
    return new User(UUID.randomUUID(), new byte[32], null, "u@example.com", null, level);
  }

  private static Event eventOwnedBy(UUID admin) {
    return new Event(
        UUID.randomUUID(), admin, "Event", "described",
        new Timestamp(System.currentTimeMillis()), false, false, true);
  }

  private static Authorization as(User actor) {
    return new Authorization(actor, true);
  }

  // --- access levels --------------------------------------------------------

  /** atLeast is a minimum, so a higher level satisfies a lower requirement. */
  @Test
  public void accessLevelsAreOrdered() {
    AccessLevel[] levels = AccessLevel.values();
    for(AccessLevel held : levels) {
      Authorization auth = as(user(held));
      for(AccessLevel required : levels) {
        boolean expected = required.ordinal() <= held.ordinal();
        assertTrue(
            auth.atLeast(required) == expected,
            String.format("a %s should%s satisfy atLeast(%s)",
                held, expected ? "" : " not", required));
      }
    }
  }

  /**
   * `is` is an exact match where `atLeast` is a minimum. The distinction is
   * live: ResetUserEndpoint and VerifyUserEndpoint use `is` where everything
   * else uses `atLeast`, so an ADMIN does not satisfy {@code is(STANDARD)}.
   */
  @Test
  public void isRequiresTheExactLevel() {
    Authorization admin = as(user(AccessLevel.ADMIN));
    assertTrue(admin.atLeast(AccessLevel.STANDARD));
    assertFalse(admin.is(AccessLevel.STANDARD));
    assertTrue(admin.is(AccessLevel.ADMIN));
  }

  // --- anonymity ------------------------------------------------------------

  /** A null actor satisfies nothing that depends on having an identity. */
  @Test
  public void anonymousIsNeverAnything() {
    Authorization anon = new Authorization(null, true);

    assertFalse(anon.atLeast(Authorization.IS_AUTHENTICATED));
    for(AccessLevel level : AccessLevel.values()) assertFalse(anon.atLeast(level));
    assertFalse(anon.atLeast(eventOwnedBy(UUID.randomUUID())));
    assertFalse(anon.atLeast(user(AccessLevel.STANDARD)));
  }

  /** Being human is a CAPTCHA verdict, not an identity. */
  @Test
  public void humanIsOrthogonalToAuthenticated() {
    assertTrue(new Authorization(null, true).atLeast(Authorization.IS_HUMAN));
    assertFalse(new Authorization(null, true).atLeast(Authorization.IS_AUTHENTICATED));
    assertFalse(new Authorization(user(AccessLevel.ADMIN), false).atLeast(Authorization.IS_HUMAN));
  }

  /**
   * A null permission silently means ADMIN. Worth pinning because it is a trap:
   * a call site that passes a null Event or User by accident gets the strictest
   * rule rather than an error, so the mistake is invisible in testing and only
   * shows up as a support ticket.
   */
  @Test
  public void aNullPermissionMeansAdmin() {
    assertTrue(as(user(AccessLevel.ADMIN)).atLeast(null));
    assertFalse(as(user(AccessLevel.STANDARD)).atLeast(null));
  }

  // --- events ---------------------------------------------------------------

  /** The owner needs only STANDARD; being the owner is what earns the access. */
  @Test
  public void anEventOwnerNeedsOnlyStandard() {
    User owner = user(AccessLevel.STANDARD);
    assertTrue(as(owner).atLeast(eventOwnedBy(owner.getID())));
  }

  /** Anyone else needs to be a platform admin. */
  @Test
  public void aNonOwnerNeedsAdmin() {
    Event event = eventOwnedBy(UUID.randomUUID());
    assertFalse(as(user(AccessLevel.STANDARD)).atLeast(event));
    assertTrue(as(user(AccessLevel.ADMIN)).atLeast(event));
  }

  /** Owning it is not enough if the account has not been verified. */
  @Test
  public void anUnverifiedOwnerIsStillRefused() {
    User owner = user(AccessLevel.UNVERIFIED);
    assertFalse(as(owner).atLeast(eventOwnedBy(owner.getID())));
  }

  /**
   * An event with no administrator is editable only by a platform admin.
   *
   * This is the rule the whole anonymous-publish flow rests on -- the guest
   * prompt warns that you will not be able to edit the event later, and this is
   * why that is true. It falls out of {@code actor.getID().equals(null)} being
   * false rather than from any explicit branch, so it is exactly the kind of
   * behaviour a refactor could quietly invert.
   */
  @Test
  public void anUnownedEventIsAdminOnly() {
    Event unowned = eventOwnedBy(null);
    assertFalse(as(user(AccessLevel.STANDARD)).atLeast(unowned));
    assertTrue(as(user(AccessLevel.ADMIN)).atLeast(unowned));
  }

  // --- users ----------------------------------------------------------------

  /** Acting on your own account needs only STANDARD. */
  @Test
  public void actingOnYourselfNeedsOnlyStandard() {
    User self = user(AccessLevel.STANDARD);
    assertTrue(as(self).atLeast(self));
  }

  /** Acting on somebody else's account needs ADMIN. */
  @Test
  public void actingOnAnotherAccountNeedsAdmin() {
    User other = user(AccessLevel.STANDARD);
    assertFalse(as(user(AccessLevel.STANDARD)).atLeast(other));
    assertTrue(as(user(AccessLevel.ADMIN)).atLeast(other));
  }

  /** An unverified account cannot even act on itself. */
  @Test
  public void anUnverifiedAccountCannotActOnItself() {
    User self = user(AccessLevel.UNVERIFIED);
    assertFalse(as(self).atLeast(self));
  }

  /** A banned account satisfies nothing above BANNED. */
  @Test
  public void aBannedAccountIsRefusedEverything() {
    User banned = user(AccessLevel.BANNED);
    Authorization auth = as(banned);

    assertTrue(auth.atLeast(Authorization.IS_AUTHENTICATED));
    assertFalse(auth.atLeast(AccessLevel.UNVERIFIED));
    assertFalse(auth.atLeast(banned));
    assertFalse(auth.atLeast(eventOwnedBy(banned.getID())));
  }
}
