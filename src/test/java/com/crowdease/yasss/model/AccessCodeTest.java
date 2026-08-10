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
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertTrue;

import java.sql.SQLException;

import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import com.crowdease.yasss.model.AccessCode.Kind;

/**
 * The shared short-code registry, in the parts that hold without a database.
 *
 * <p>The registry exists because one input box resolves both events and polls,
 * so the two draw from one namespace. What that turns on is
 * {@link AccessCode#isCodeCollision(SQLException)}: it is the predicate
 * {@code commit}'s retry loop consults, and it has to be exactly right in both
 * directions. Too narrow and a real collision escapes as a 500 rather than
 * being retried. Too broad and an unrelated duplicate-key failure -- a second
 * signup, a repeated nonce -- is silently retried with a fresh code, five
 * times, and then surfaces as the wrong error entirely.
 *
 * <p>The registry's own uniqueness, the cross-kind guarantee and the backfill's
 * idempotency need a real MariaDB and belong to {@code e2e/run.sh}; nothing in
 * this suite opens a connection.
 *
 * @author Caleb L. Power
 */
public class AccessCodeTest {

  /** MariaDB's duplicate-key error. */
  private static final int DUPLICATE = 1062;

  private static SQLException duplicate(String index) {
    return new SQLException(
        "Duplicate entry 'ABCD1234' for key '" + index + "'",
        "23000",
        DUPLICATE);
  }

  /**
   * All three index names count.
   *
   * <p>A collision can be caught by whichever index the write reached first:
   * the registry's, or the display copy's on either table. Recognising only the
   * registry's would leave the other two escaping the retry loop.
   */
  @DataProvider(name = "collisionIndexes")
  public Object[][] collisionIndexes() {
    return new Object[][] { { "idx_access_code" }, { "idx_event_code" }, { "idx_poll_code" } };
  }

  @Test(dataProvider = "collisionIndexes")
  public void recognisesACodeCollision(String index) {
    assertTrue(AccessCode.isCodeCollision(duplicate(index)));
  }

  /**
   * A duplicate on something that is not a code is not a code collision.
   *
   * <p>This is the direction that would do real damage. Retrying a repeated
   * auth nonce or a re-cast RSVP with a fresh short code accomplishes nothing,
   * burns five codes, and reports the failure as whatever the fifth attempt
   * happened to hit.
   */
  @DataProvider(name = "otherFailures")
  public Object[][] otherFailures() {
    return new Object[][] {
      { duplicate("PRIMARY") },
      { duplicate("idx_user_email") },
      { duplicate("idx_poll_option_dow") },
      { duplicate("idx_poll_cell_allday") },
      { duplicate("idx_poll_window_time") },
      { new SQLException("Deadlock found when trying to get lock", "40001", 1213) },
      { new SQLException("Cannot add or update a child row", "23000", 1452) },
      // Right index name, wrong error: not a duplicate key at all.
      { new SQLException("something about idx_access_code", "HY000", 1105) },
      // A driver that gave us nothing to go on.
      { new SQLException((String)null, "23000", DUPLICATE) }
    };
  }

  @Test(dataProvider = "otherFailures")
  public void doesNotRetryUnrelatedFailures(SQLException e) {
    assertFalse(AccessCode.isCodeCollision(e));
  }

  /**
   * The stored ordinals. Appending is safe; reordering is a data migration, so
   * this pins the two that exist.
   */
  @Test public void kindOrdinalsAreStable() {
    assertEquals(Kind.EVENT.ordinal(), 0);
    assertEquals(Kind.POLL.ordinal(), 1);
    assertEquals(Kind.fromOrdinal(0), Kind.EVENT);
    assertEquals(Kind.fromOrdinal(1), Kind.POLL);
  }

  /**
   * An unknown kind resolves to null rather than clamping, which is the
   * opposite of every other {@code fromOrdinal} in this package.
   *
   * <p>Those answer "how should this row be rendered", where a sensible default
   * beats an exception. This answers "what does this code open", and a default
   * would send somebody to the wrong thing with every appearance of success.
   */
  @DataProvider(name = "unknownKinds")
  public Object[][] unknownKinds() {
    return new Object[][] { { -1 }, { 2 }, { 7 }, { 255 }, { Integer.MAX_VALUE } };
  }

  @Test(dataProvider = "unknownKinds")
  public void anUnknownKindIsNotGuessedAt(int ordinal) {
    assertNull(Kind.fromOrdinal(ordinal));
  }
}
