/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A pending WebAuthn ceremony.
 *
 * <p>The challenge is what makes an assertion fresh, and spending it is what makes the
 * assertion single-use. That second property is the whole security claim: an
 * authenticator reporting {@code signCount = 0} — which is most of them, because a synced
 * credential has no single device to count on — offers no replay protection of its own, so
 * a challenge that could be used twice would make the assertion replayable for its
 * lifetime.
 *
 * <p>Hence a table rather than a signed cookie. A stateless challenge is cheaper and
 * cannot be single-use.
 *
 * @author Caleb L. Power
 */
public final class PasskeyChallenge {

  private static final Logger logger = LoggerFactory.getLogger(PasskeyChallenge.class);
  private static final SecureRandom RANDOM = new SecureRandom();

  /** Which ceremony a challenge belongs to. */
  public static enum Ceremony {

    /** Enrolling a new credential. Carries the account it was issued for. */
    REGISTRATION,

    /** Signing in. Usernameless, so it carries no account. */
    AUTHENTICATION;

    /** @return the value stored in the {@code ceremony} column */
    public int code() {
      return ordinal();
    }
  }

  /**
   * An issued challenge.
   *
   * @param challenge the 32 random bytes the authenticator will sign over
   * @param user the account it was issued for, or {@code null} for authentication
   * @param expiresAt epoch milliseconds after which it is refused
   */
  public static record Issued(byte[] challenge, UUID user, long expiresAt) { }

  /**
   * Issues a challenge and records it.
   *
   * @param ceremony which ceremony this is for
   * @param user the account, for registration; {@code null} for authentication
   * @param now epoch milliseconds
   * @return the issued challenge
   * @throws SQLException if it could not be recorded
   */
  public static Issued issue(Ceremony ceremony, UUID user, long now) throws SQLException {
    byte[] challenge = new byte[32];
    RANDOM.nextBytes(challenge);
    long expiresAt = now + YasssCore.getPasskeyChallengeTTL();

    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "INSERT INTO %1$spasskey_challenge "
              + "(challenge, user, ceremony, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
              YasssCore.getDB().getPrefix()));
      stmt.setBytes(1, challenge);
      stmt.setBytes(2, null == user ? null : SQLBuilder.uuidToBytes(user));
      stmt.setInt(3, ceremony.code());
      stmt.setLong(4, now);
      stmt.setLong(5, expiresAt);
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }

    return new Issued(challenge, user, expiresAt);
  }

  /**
   * Spends a challenge, if it is still outstanding and belongs to this ceremony.
   *
   * <p>The {@code DELETE} <em>is</em> the claim: only the caller whose statement affects a
   * row may continue, which makes two concurrent finishes of one challenge safe across
   * instances with no coordination. Reading the row first would be a race; this is not.
   *
   * <p>{@code ceremony} is in the predicate rather than merely checked afterwards, so a
   * registration challenge cannot be spent as an authentication one.
   *
   * @param challenge the bytes the client returned
   * @param ceremony the ceremony being finished
   * @param now epoch milliseconds
   * @return the account it was issued for, or {@code null} if it was not claimable
   * @throws SQLException if the ledger could not be read
   */
  public static ClaimResult claim(byte[] challenge, Ceremony ceremony, long now)
      throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();

      // Read for the payload, delete for the authority. The SELECT tells us which account
      // and whether it has expired; the DELETE decides whether this caller is the one
      // allowed to act on that.
      stmt = con.prepareStatement(
          String.format(
              "SELECT user, expires_at FROM %1$spasskey_challenge "
              + "WHERE challenge = ? AND ceremony = ?",
              YasssCore.getDB().getPrefix()));
      stmt.setBytes(1, challenge);
      stmt.setInt(2, ceremony.code());
      res = stmt.executeQuery();

      UUID user = null;
      long expiresAt = 0L;
      boolean found = res.next();
      if(found) {
        byte[] raw = res.getBytes("user");
        user = null == raw ? null : SQLBuilder.bytesToUUID(raw);
        expiresAt = res.getLong("expires_at");
      }
      YasssCore.getDB().close(null, stmt, res);
      stmt = null;
      res = null;

      if(!found) return new ClaimResult(false, null, false);

      stmt = con.prepareStatement(
          String.format(
              "DELETE FROM %1$spasskey_challenge WHERE challenge = ? AND ceremony = ?",
              YasssCore.getDB().getPrefix()));
      stmt.setBytes(1, challenge);
      stmt.setInt(2, ceremony.code());
      boolean won = 0 != stmt.executeUpdate();

      // Expiry is reported separately from "not claimable" so the caller can say which,
      // and so an expired challenge is still consumed rather than left to be retried.
      return new ClaimResult(won, user, won && now <= expiresAt);

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * What happened to a claim.
   *
   * @param claimed whether this caller is the one that removed the row
   * @param user the account it was issued for, or {@code null}
   * @param usable whether it was claimed <em>and</em> still fresh
   */
  public static record ClaimResult(boolean claimed, UUID user, boolean usable) { }

  /**
   * Drops challenges nobody can still finish.
   *
   * <p>Opportunistic, from the begin endpoints, rather than from a daemon. Never fatal: a
   * failure to prune grows a table, while a failure to issue stops a sign-in.
   *
   * @param now epoch milliseconds
   */
  public static void prune(long now) {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "DELETE FROM %1$spasskey_challenge WHERE expires_at < ?",
              YasssCore.getDB().getPrefix()));
      stmt.setLong(1, now);
      int dropped = stmt.executeUpdate();
      if(0 < dropped) logger.debug("pruned {} expired passkey challenge(s)", dropped);

    } catch(SQLException e) {
      logger.warn("could not prune passkey challenges: {}", e.getMessage());
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  private PasskeyChallenge() { }

}
