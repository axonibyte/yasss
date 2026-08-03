/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.daemon;

import static org.testng.Assert.expectThrows;

import org.testng.annotations.Test;

/**
 * Covers the reminder sweep's configuration guards.
 *
 * <p>The window arithmetic itself now lives in SQL, because an event may
 * override the global lead time and the bound is therefore per row rather than
 * per sweep. What is left here is the configuration guard, which matters for
 * the same reason: a daemon misconfigured at construction does not fail loudly,
 * it just mails everybody far too early or never at all.
 *
 * @author Caleb L. Power
 */
public class ReminderEngineTest {

  @Test public void constructor_rejectsNonPositiveIntervals() {
    expectThrows(
        IllegalArgumentException.class,
        () -> new ReminderEngine(0, 1440, 200, true));
    expectThrows(
        IllegalArgumentException.class,
        () -> new ReminderEngine(5, 0, 200, true));
    expectThrows(
        IllegalArgumentException.class,
        () -> new ReminderEngine(5, 1440, 0, true));
  }

  @Test public void constructor_acceptsTheShippedDefaults() {
    new ReminderEngine(5, 1440, 200, true);
  }
}
