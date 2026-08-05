/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss;

import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.sql.SQLException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.testng.annotations.Test;

/**
 * Covers the deadline on the readiness check.
 *
 * <p>The bound is the whole point. The connection pool's own timeout is
 * measured in tens of seconds and is not configurable through
 * {@code axb-lib-db}, so a health check that just waited on it would hang for
 * half a minute before reporting anything — which is worse for a supervisor
 * than the lie it replaces, because a hung probe and a slow one look identical.
 *
 * <p>Taking the probe as a {@link java.util.concurrent.Callable} rather than
 * hard-coding the query is what makes this testable without a database.
 *
 * @author Caleb L. Power
 */
public class HealthProbeTest {

  @Test public void passes_whenTheProbeSaysYes() {
    assertTrue(YasssCore.within(2_000L, () -> true));
  }

  @Test public void fails_whenTheProbeSaysNo() {
    assertFalse(YasssCore.within(2_000L, () -> false));
  }

  @Test public void fails_whenTheProbeReturnsNull() {
    // `Boolean.TRUE.equals(...)` rather than an unboxing comparison, because
    // unboxing a null would throw out of the health check itself.
    assertFalse(YasssCore.within(2_000L, () -> null));
  }

  @Test public void fails_whenTheProbeThrows() {
    // What a refused connection looks like.
    assertFalse(
        YasssCore.within(2_000L, () -> {
          throw new SQLException("connection refused");
        }));
  }

  @Test(timeOut = 5_000L) public void fails_whenTheProbeHangs() throws Exception {
    // The case that matters: a probe blocked on a dead socket must be abandoned,
    // not waited out. The method timeout is the real assertion -- if `within`
    // ever waits for the probe, this test hangs rather than fails, and TestNG
    // ends it.
    CountDownLatch release = new CountDownLatch(1);
    try {
      long began = System.currentTimeMillis();
      assertFalse(YasssCore.within(150L, () -> {
        release.await();
        return true;
      }));
      long took = System.currentTimeMillis() - began;
      assertTrue(took < 2_000L, "gave up after " + took + "ms, which is not a deadline");
    } finally {
      release.countDown();
    }
  }

  @Test public void interruptsTheProbeItAbandoned() throws Exception {
    // Abandoning it is not enough on its own; the thread has to be told, or a
    // deployment with an unreachable database accumulates one blocked thread
    // per poll for as long as the supervisor keeps asking.
    CountDownLatch interrupted = new CountDownLatch(1);

    assertFalse(YasssCore.within(150L, () -> {
      try {
        Thread.sleep(10_000L);
      } catch(InterruptedException e) {
        interrupted.countDown();
      }
      return true;
    }));

    assertTrue(
        interrupted.await(2, TimeUnit.SECONDS),
        "the abandoned probe was never interrupted");
  }

  @Test public void version_isNeverBlank() {
    // Read from the jar manifest, which does not exist when running from
    // compiled classes -- so this answers the honest placeholder here rather
    // than null, which would reach a JSON payload and a log line.
    String version = YasssCore.getVersion();
    assertFalse(null == version || version.isBlank());
  }
}
