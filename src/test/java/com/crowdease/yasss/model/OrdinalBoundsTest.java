/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertEquals;

import com.crowdease.yasss.model.User.AccessLevel;

import org.testng.annotations.Test;
import org.testng.annotations.DataProvider;

/**
 * Enum columns read back from the database.
 *
 * <p>{@code access_level} and {@code detail_type} are {@code TINYINT UNSIGNED},
 * and both were read straight into {@code values()[ordinal]}. Anything outside
 * the enum — a direct database edit, a backup restored from a schema where the
 * enum had more members, a future release that removes one — threw
 * {@link ArrayIndexOutOfBoundsException} from inside a model getter. No endpoint
 * catches that, so a single bad row turned every read of the event containing it
 * into a 500.
 *
 * <p>The fallbacks are chosen to fail closed where that means anything:
 * an unreadable access level grants the least, and an unreadable detail type
 * accepts the most — because refusing an answer that is already stored would
 * make the row permanently unreadable rather than merely odd.
 *
 * @author Caleb L. Power
 */
public class OrdinalBoundsTest {

  @DataProvider(name = "outOfRange")
  public Object[][] outOfRange() {
    return new Object[][] { { -1 }, { 99 }, { Integer.MAX_VALUE }, { Integer.MIN_VALUE } };
  }

  @Test(dataProvider = "outOfRange")
  public void accessLevelFallsBackToTheLeastPrivilege(int ordinal) {
    assertEquals(User.accessLevelOf(ordinal), AccessLevel.BANNED);
  }

  @Test
  public void accessLevelStillResolvesEveryRealOrdinal() {
    for(AccessLevel level : AccessLevel.values())
      assertEquals(User.accessLevelOf(level.ordinal()), level);
  }

  @Test(dataProvider = "outOfRange")
  public void detailTypeFallsBackToTheMostPermissive(int ordinal) {
    assertEquals(Detail.typeOf(ordinal), Detail.Type.STRING);
  }

  @Test
  public void detailTypeStillResolvesEveryRealOrdinal() {
    for(Detail.Type type : Detail.Type.values())
      assertEquals(Detail.typeOf(type.ordinal()), type);
  }
}
