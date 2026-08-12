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
import java.util.UUID;

import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import com.crowdease.yasss.model.Poll.ResultVisibility;
import com.crowdease.yasss.model.Poll.Scope;
import com.crowdease.yasss.model.Poll.TimeMode;

/**
 * A poll's three stored enums, and the rule that decides whether its votes are
 * disclosed.
 *
 * <p>All four are pure functions of their arguments, which is the point: the
 * one rule in this feature that decides whether votes leak should be provable
 * without a database, a session or an HTTP request anywhere near it.
 *
 * <p>The ordinal clamping mirrors {@code DetailTypeTest} and
 * {@code OrdinalBoundsTest}: the columns are {@code TINYINT UNSIGNED} and a
 * value outside the range must not turn one bad row into a 500 on every read of
 * the poll containing it.
 *
 * @author Caleb L. Power
 */
public class PollScopeTest {

  @DataProvider(name = "outOfRange")
  public Object[][] outOfRange() {
    return new Object[][] {
      { -1 }, { 7 }, { 42 }, { 255 }, { Integer.MAX_VALUE }, { Integer.MIN_VALUE }
    };
  }

  @Test(dataProvider = "outOfRange")
  public void scopeClampsToRelative(int ordinal) {
    assertEquals(Scope.fromOrdinal(ordinal), Scope.RELATIVE);
  }

  @Test(dataProvider = "outOfRange")
  public void timeModeClampsToWallClock(int ordinal) {
    assertEquals(TimeMode.fromOrdinal(ordinal), TimeMode.WALL_CLOCK);
  }

  /**
   * The one clamp that goes towards the restrictive answer rather than the
   * permissive one. A row this build cannot interpret must not have its tallies
   * published on the strength of a guess.
   */
  @Test(dataProvider = "outOfRange")
  public void visibilityClampsToCreatorOnly(int ordinal) {
    assertEquals(ResultVisibility.fromOrdinal(ordinal), ResultVisibility.CREATOR_ONLY);
  }

  @Test public void everyDeclaredOrdinalRoundTrips() {
    for(Scope value : Scope.values())
      assertEquals(Scope.fromOrdinal(value.ordinal()), value);
    for(TimeMode value : TimeMode.values())
      assertEquals(TimeMode.fromOrdinal(value.ordinal()), value);
    for(ResultVisibility value : ResultVisibility.values())
      assertEquals(ResultVisibility.fromOrdinal(value.ordinal()), value);
  }

  /**
   * The defaults a freshly constructed poll carries, which are what a create
   * request gets when it says nothing.
   *
   * <p>Wall clock rather than zoned, because the common poll is asked of people
   * who are all in one place and a zone nobody chose is a zone nobody checked.
   * Creator-only results, because widening later is a decision and narrowing
   * later cannot un-disclose anything.
   */
  @Test public void defaultsAreTheConservativeOnes() {
    Poll poll = draft();
    assertEquals(poll.getTimeMode(), TimeMode.WALL_CLOCK);
    assertEquals(poll.getResultVisibility(), ResultVisibility.CREATOR_ONLY);
    assertTrue(poll.allowMultiAnswers());
    assertTrue(poll.allowAnswerEdits());
  }

  /**
   * The organizer always sees their own poll's results.
   *
   * <p>The six settings describe what everybody else gets. A setting that hid
   * the tallies from the person who ran the poll would leave nobody able to act
   * on it.
   */
  @Test public void theOwnerAlwaysSeesTheTally() {
    for(ResultVisibility visibility : ResultVisibility.values())
      for(boolean responded : new boolean[] { false, true })
        for(boolean closed : new boolean[] { false, true })
          assertTrue(
              Poll.tallyVisible(visibility, true, responded, closed),
              visibility + " hid the tally from the poll's own organizer");
  }

  /**
   * The full matrix for everybody who is not the organizer.
   *
   * <p>Written out as data rather than derived, so that changing the rule means
   * changing this table -- and a change to the table is visible in a diff in a
   * way that a change to a switch statement it mirrors is not.
   */
  @DataProvider(name = "strangers")
  public Object[][] strangers() {
    return new Object[][] {
      //                                      responded  closed  visible
      { ResultVisibility.CREATOR_ONLY,                false, false, false },
      { ResultVisibility.CREATOR_ONLY,                true,  true,  false },

      { ResultVisibility.PUBLIC_ALWAYS,               false, false, true  },
      { ResultVisibility.PUBLIC_ALWAYS,               false, true,  true  },

      { ResultVisibility.PUBLIC_AFTER_CLOSE,          false, false, false },
      { ResultVisibility.PUBLIC_AFTER_CLOSE,          false, true,  true  },
      { ResultVisibility.PUBLIC_AFTER_CLOSE,          true,  false, false },

      { ResultVisibility.RESPONDENT_OWN,              true,  true,  false },
      { ResultVisibility.RESPONDENT_OWN,              false, false, false },

      { ResultVisibility.RESPONDENT_ALL_AFTER_SUBMIT, false, false, false },
      { ResultVisibility.RESPONDENT_ALL_AFTER_SUBMIT, true,  false, true  },
      { ResultVisibility.RESPONDENT_ALL_AFTER_SUBMIT, true,  true,  true  },

      { ResultVisibility.RESPONDENT_ALL_AFTER_CLOSE,  false, false, false },
      { ResultVisibility.RESPONDENT_ALL_AFTER_CLOSE,  true,  false, false },
      { ResultVisibility.RESPONDENT_ALL_AFTER_CLOSE,  false, true,  false },
      { ResultVisibility.RESPONDENT_ALL_AFTER_CLOSE,  true,  true,  true  }
    };
  }

  @Test(dataProvider = "strangers")
  public void tallyVisibilityMatrix(ResultVisibility visibility, boolean responded,
      boolean closed, boolean visible) {
    assertEquals(
        Poll.tallyVisible(visibility, false, responded, closed),
        visible,
        visibility + " responded=" + responded + " closed=" + closed);
  }

  /**
   * The two settings that are meaningless without a deadline, and the one that
   * cannot recognize a respondent without an account.
   *
   * <p>Both are checked at publish rather than at write, so that a half-built
   * draft is allowed to exist -- but they have to be checked somewhere, or a
   * poll can be published into a state where nobody will ever see its results.
   */
  @Test public void closingSettingsDeclareWhatTheyNeed() {
    for(ResultVisibility visibility : ResultVisibility.values()) {
      Poll poll = draft().setResultVisibility(visibility);
      boolean afterClose = ResultVisibility.PUBLIC_AFTER_CLOSE == visibility
          || ResultVisibility.RESPONDENT_ALL_AFTER_CLOSE == visibility;
      assertEquals(poll.requiresDeadline(), afterClose, visibility.toString());
      assertEquals(
          poll.requiresAuthenticatedAnswers(),
          ResultVisibility.RESPONDENT_ALL_AFTER_CLOSE == visibility,
          visibility.toString());
    }
  }

  /**
   * A poll with no deadline never closes.
   *
   * <p>Not an oversight to guard against. A relative poll has no dates that
   * could pass, so a deadline is the only thing that could ever close one, and
   * running an open-ended poll is a legitimate thing to want.
   */
  @Test public void aPollWithNoDeadlineNeverCloses() {
    assertFalse(draft().isClosed());
  }

  @Test public void aPollClosesOnceItsDeadlineHasPassed() {
    long now = System.currentTimeMillis();
    assertTrue(draft().setResponseDeadline(new Timestamp(now - 60_000L)).isClosed());
    assertFalse(draft().setResponseDeadline(new Timestamp(now + 60_000L)).isClosed());
  }

  private static Poll draft() {
    return new Poll(
        UUID.randomUUID(),
        null,
        "When shall we meet?",
        "Pick every time that works for you.",
        Scope.RELATIVE,
        new Timestamp(System.currentTimeMillis()),
        false);
  }
}
