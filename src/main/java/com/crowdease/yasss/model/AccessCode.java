/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;

/**
 * The allocator behind short codes, and the only thing that decides what a code
 * names.
 *
 * <p>{@link EventCode} makes codes; this decides who holds one. The distinction
 * started mattering the moment a second kind of thing wanted one: a visitor
 * typing eight characters off a flyer does not know whether they are holding an
 * event or a poll, so both are resolved from a single box, and the two must
 * therefore draw from a single namespace.
 *
 * <p>Per-table unique indexes cannot give that. They make a cross-kind
 * collision legal, and a resolver that tries events and then polls would hide
 * the poll permanently — with no error and nothing in the log, because as far
 * as the database is concerned nothing went wrong. One shared unique index
 * turns the same situation into a duplicate-key violation, which is a thing
 * {@link Event#commit()}'s retry loop already handles.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public final class AccessCode {

  private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(AccessCode.class);

  /**
   * What kind of thing a code names.
   *
   * <p>The ordinal is the stored value, so the order of these is a schema
   * decision and not a stylistic one. Append only.
   *
   * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
   */
  public static enum Kind {

    /** An {@link Event}. */
    EVENT,

    /** A {@link Poll}. */
    POLL;

    /**
     * Resolves a stored ordinal into a {@link Kind}.
     *
     * @param ordinal the stored ordinal
     * @return the {@link Kind}, or {@code null} if this build does not know it
     */
    public static Kind fromOrdinal(int ordinal) {
      Kind[] values = values();
      // Null rather than a clamp, which every other fromOrdinal in this package
      // does. Those answer "how should this row be rendered", where a sensible
      // default beats an exception. This answers "what does this code open",
      // and guessing would send somebody to the wrong thing entirely -- so an
      // unknown kind reads as "no idea", and the caller answers 404.
      return 0 <= ordinal && ordinal < values.length ? values[ordinal] : null;
    }
  }

  /**
   * What a code names.
   *
   * @param kind the kind of thing
   * @param target the {@link UUID} of the thing
   */
  public static record Ref(Kind kind, UUID target) { }

  private AccessCode() { }

  /**
   * Claims a code for a target.
   *
   * <p>Runs on the caller's connection, before the row it belongs to is
   * written. The order is deliberate: claiming first means the worst outcome of
   * a failure between the two statements is one code burned out of a trillion,
   * whereas writing first would mean a thing exists holding a code the registry
   * has not reserved — which another thing could then be handed, leaving two
   * rows claiming one code and the resolver preferring whichever it looked at
   * first.
   *
   * @param con the {@link Connection} to use
   * @param kind the {@link Kind} of thing being named
   * @param target the {@link UUID} of the thing
   * @param code the canonical code
   * @throws SQLException if the code is taken, the target already holds one, or
   *         a database malfunction occurs
   */
  public static void claim(Connection con, Kind kind, UUID target, String code)
      throws SQLException {
    PreparedStatement stmt = null;

    try {
      stmt = con.prepareStatement(
          new SQLBuilder()
              .insert(
                  YasssCore.getDB().getPrefix() + "access_code",
                  "code",
                  "kind",
                  "target")
              .toString());
      stmt.setString(1, code);
      stmt.setInt(2, kind.ordinal());
      stmt.setBytes(3, SQLBuilder.uuidToBytes(target));
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(null, stmt, null);
    }
  }

  /**
   * Releases the code a target holds, if it holds one.
   *
   * <p>Called from {@link Event#delete()} and {@link Poll#delete()}, because
   * {@code target} names two tables and so cannot carry a foreign key that
   * would do this by cascade.
   *
   * @param kind the {@link Kind} of thing
   * @param target the {@link UUID} of the thing
   * @throws SQLException if a database malfunction occurs
   */
  public static void release(Kind kind, UUID target) throws SQLException {
    if(null == target) return;

    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "access_code")
              .where(
                  "kind",
                  "target")
              .toString());
      stmt.setInt(1, kind.ordinal());
      stmt.setBytes(2, SQLBuilder.uuidToBytes(target));
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Resolves a code to whatever it names.
   *
   * @param rawCode the code, in any spelling a human might produce
   * @return a {@link Ref}, or {@code null} if nothing holds that code
   * @throws SQLException if a database malfunction occurs
   */
  public static Ref resolve(String rawCode) throws SQLException {
    String canonical = EventCode.normalize(rawCode);
    if(null == canonical) return null;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "access_code",
                  "kind",
                  "target")
              .where("code")
              .limit(1)
              .toString());
      stmt.setString(1, canonical);
      res = stmt.executeQuery();

      if(res.next()) {
        int ordinal = res.getInt("kind");
        Kind kind = Kind.fromOrdinal(ordinal);
        if(null == kind) {
          // A row written by a newer build than this one. Worth a line: it
          // means a visitor holding a perfectly valid code is being told it
          // does not exist, and nothing else would ever say why.
          LOG.warn("code {} names an unknown kind of thing ({})", canonical, ordinal);
          return null;
        }
        return new Ref(
            kind,
            SQLBuilder.bytesToUUID(
                res.getBytes("target")));
      }

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return null;
  }

  /**
   * Whether a failure was a code colliding with one already issued.
   *
   * <p>Matched on index names so that a duplicate on any other constraint is not
   * silently retried into a different failure. All three are listed because a
   * collision can be caught by whichever index the write reached first: the
   * registry's, or the display copy's on either table.
   *
   * @param e the failure
   * @return {@code true} iff a fresh code is worth trying
   */
  public static boolean isCodeCollision(SQLException e) {
    if(1062 != e.getErrorCode() || null == e.getMessage()) return false;
    String message = e.getMessage();
    return message.contains("idx_access_code")
        || message.contains("idx_event_code")
        || message.contains("idx_poll_code");
  }

  /**
   * Registers every code that predates this table.
   *
   * <p>Idempotent and self-limiting, in the shape {@link Event#backfillCodes()}
   * established: {@code INSERT IGNORE} makes a second run a no-op rather than a
   * pile of duplicate-key failures, and after the first boot it inserts nothing.
   *
   * <p>Must run before {@link Event#backfillCodes()}. A code minted for a legacy
   * event would otherwise be checked against a registry that does not yet
   * contain the codes it might collide with. The event table's own unique index
   * would still catch it, so the order is a belt beside braces rather than the
   * only thing holding this up — but it costs nothing and it is the correct
   * order.
   *
   * @return the number of codes registered
   * @throws SQLException if a database malfunction occurs
   */
  public static int backfill() throws SQLException {
    int done = 0;
    done += backfillFrom("event", Kind.EVENT);
    done += backfillFrom("poll", Kind.POLL);
    return done;
  }

  private static int backfillFrom(String table, Kind kind) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      // Hand-built: this is INSERT ... SELECT with IGNORE, which SQLBuilder has
      // no vocabulary for. The table name is a constant from this file and
      // never caller-supplied, so there is nothing here to interpolate unsafely.
      stmt = con.prepareStatement(
          "INSERT IGNORE INTO " + YasssCore.getDB().getPrefix() + "access_code"
              + " (code, kind, target)"
              + " SELECT code, ?, id FROM " + YasssCore.getDB().getPrefix() + table
              + " WHERE code IS NOT NULL");
      stmt.setInt(1, kind.ordinal());
      return stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
}
