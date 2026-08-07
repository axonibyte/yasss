/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The single-use guarantee for v2 credentials.
 *
 * <p>A credential carries a random nonce; presenting it spends that nonce. The composite
 * primary key on {@code auth_nonce} is the guarantee, exactly as {@code reminder_log}'s is
 * for reminder sends: the claim is an {@code INSERT IGNORE} and only the caller whose
 * insert affects a row may continue.
 *
 * <p><b>Why a table and not a map.</b> An in-memory cache gives zero protection across
 * instances — an attacker replays against a different node and wins — and is empty after
 * every deploy, so a header captured shortly before a restart is replayable shortly after
 * one. Neither failure shows up in testing, which is the worst property a security control
 * can have. A shared table costs one insert per sign-in, on a path that was until now
 * spending 16 MiB of scrypt.
 *
 * @author Caleb L. Power
 */
public final class AuthNonce {

  private static final Logger logger = LoggerFactory.getLogger(AuthNonce.class);

  /** At most one reap a minute per instance, whatever the traffic. */
  private static final long REAP_INTERVAL_MILLIS = 60_000L;

  /**
   * How long a spent nonce is remembered beyond the skew window.
   *
   * <p>Must be positive, or a credential could outlive the record of its own use and
   * become replayable in the gap.
   */
  private static final long REAP_GRACE_MILLIS = 60_000L;

  private static final AtomicLong lastReap = new AtomicLong(0L);

  /**
   * Spends a nonce, if it has not already been spent.
   *
   * <p><b>Call this only after the signature has verified.</b> Claiming first would let any
   * unauthenticated caller write rows — cheap write amplification — and, far worse, would
   * let somebody who observed a credential in flight burn its nonce before the legitimate
   * request arrived. A replay therefore costs one Ed25519 verification, which is
   * microseconds.
   *
   * @param account the account the credential names
   * @param jti the sixteen raw bytes of the nonce
   * @param issuedAt the credential's timestamp, epoch milliseconds
   * @return {@code true} if the nonce was unused and is now spent
   * @throws SQLException if the ledger cannot be written, which must not be mistaken for
   *         a replay
   */
  public static boolean claim(UUID account, byte[] jti, long issuedAt) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "INSERT IGNORE INTO %1$sauth_nonce (account, jti, iat) VALUES (?, ?, ?)",
              YasssCore.getDB().getPrefix()));
      stmt.setBytes(1, SQLBuilder.uuidToBytes(account));
      stmt.setBytes(2, jti);
      stmt.setLong(3, issuedAt);

      boolean won = 0 != stmt.executeUpdate();
      if(!won) {
        // INSERT IGNORE downgrades genuine errors to warnings and returns zero, so a
        // truncated column or a constraint violation looks exactly like a replay unless
        // the warnings are read. Here that distinction is the difference between "one
        // caller was refused" and "every sign-in fails and the log says nothing".
        logger.info(
            "refused a replayed credential for {}; warnings: {}",
            account,
            warningsOf(stmt));
      }
      return won;

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * The statement's warnings, as a string, without ever throwing.
   *
   * <p>{@code getWarnings()} is itself allowed to fail, and on MariaDB Connector/J it
   * does. That turned an ordinary refused replay into a propagating {@code SQLException}
   * -- the precise inversion this method's caller documents as unacceptable, reporting a
   * replay as a database failure. A diagnostic must not be able to break the thing it is
   * diagnosing.</p>
   */
  private static String warningsOf(PreparedStatement stmt) {
    try {
      var warning = stmt.getWarnings();
      return null == warning ? "none" : warning.toString();
    } catch(Exception e) {
      return "unavailable (" + e.getMessage() + ")";
    }
  }

  /**
   * Drops nonces that can no longer be replayed, at most once a minute per instance.
   *
   * <p>Called from the sign-in path rather than from a daemon: it needs no thread, and the
   * table is bounded by <em>time</em> rather than by traffic, so a quiet week leaves no
   * stale rows and a login storm does not defer the sweep.
   *
   * <p>Never fatal. Failing to reap grows a table; failing to sign in does not.
   *
   * @param now epoch milliseconds
   * @param skewMillis the configured skew window
   */
  public static void reapIfDue(long now, long skewMillis) {
    long previous = lastReap.get();
    if(now - previous < REAP_INTERVAL_MILLIS) return;
    // Only the thread that wins the CAS reaps; the rest carry on to the actual request.
    if(!lastReap.compareAndSet(previous, now)) return;

    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "DELETE FROM %1$sauth_nonce WHERE iat < ?",
              YasssCore.getDB().getPrefix()));
      stmt.setLong(1, now - skewMillis - REAP_GRACE_MILLIS);

      int dropped = stmt.executeUpdate();
      if(0 < dropped) logger.debug("reaped {} expired credential nonce(s)", dropped);

    } catch(SQLException e) {
      logger.warn("could not reap expired credential nonces: {}", e.getMessage());
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  private AuthNonce() { }

}
