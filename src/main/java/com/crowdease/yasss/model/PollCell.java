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
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.db.Comparison;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.SQLBuilder.Join;
import com.crowdease.yasss.YasssCore;

/**
 * A square somebody can vote for: a {@link PollOption} intersected with a
 * {@link PollWindow}, or a whole {@link PollOption} on an all-day column.
 *
 * <p>A row exists if and only if the square is offered — the same convention
 * {@link Slot} uses — so "unavailable" is the absence of a row rather than a
 * flag on one.
 *
 * <h2>Why this has an id when {@link Slot} does not</h2>
 *
 * <p>A {@link Slot} is keyed by its two parents and needs no surrogate. The
 * all-day square has only one parent, which would mean a NULL window in a
 * composite key — and MySQL and MariaDB compare NULLs distinct in a unique
 * index, so that key would constrain nothing at all for exactly the rows it
 * most needed to. A vote table keyed the same way would then let one person
 * vote all-day repeatedly, inflating the tally without violating a single
 * constraint. Giving the square an id moves that problem to a table the public
 * never writes, and lets {@link PollVote} hold no nullable column at all.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public class PollCell {

  private UUID id = null;
  private UUID option = null;
  private UUID window = null;

  /**
   * Instantiates a {@link PollCell}.
   *
   * @param id the {@link UUID} of this square, or {@code null} if uncommitted
   * @param option the {@link UUID} of the {@link PollOption} column
   * @param window the {@link UUID} of the {@link PollWindow} row, or
   *        {@code null} for the all-day square
   */
  public PollCell(UUID id, UUID option, UUID window) {
    this.id = id;
    this.option = option;
    this.window = window;
  }

  /** @return this square's {@link UUID} */
  public UUID getID() {
    return id;
  }

  /** @return the {@link UUID} of the {@link PollOption} this square sits in */
  public UUID getOption() {
    return option;
  }

  /**
   * Retrieves the row this square sits in.
   *
   * @return the {@link PollWindow}'s {@link UUID}, or {@code null} on the
   *         all-day square
   */
  public UUID getWindow() {
    return window;
  }

  /**
   * Determines whether this is the all-day square of its column.
   *
   * @return {@code true} iff this square asks about the whole day
   */
  public boolean isAllDay() {
    return null == window;
  }

  /**
   * Retrieves every square offered by a {@link Poll}.
   *
   * <p>Joined through {@code poll_option} because a square has no poll of its
   * own — it belongs to a column, and the column belongs to the poll. Ordering
   * is left to the caller, which holds the options and windows in the order
   * they render.
   *
   * @param pollID the {@link UUID} of the {@link Poll}
   * @return a {@link Set} of {@link PollCell} objects
   * @throws SQLException if a database malfunction occurs
   */
  public static Set<PollCell> getCells(UUID pollID) throws SQLException {
    if(null == pollID) return new LinkedHashSet<>();

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_cell",
                  "c.id",
                  "c.poll_option",
                  "c.poll_window")
              .tableAlias("c")
              .join(
                  Join.INNER,
                  YasssCore.getDB().getPrefix() + "poll_option",
                  "o",
                  new Comparison("c.poll_option", "o.id", ComparisonOp.EQUAL_TO))
              .where("o.poll")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(pollID));
      res = stmt.executeQuery();

      Set<PollCell> cells = new LinkedHashSet<>();
      while(res.next())
        cells.add(
            new PollCell(
                SQLBuilder.bytesToUUID(
                    res.getBytes("c.id")),
                SQLBuilder.bytesToUUID(
                    res.getBytes("c.poll_option")),
                SQLBuilder.bytesToUUID(
                    res.getBytes("c.poll_window"))));
      return cells;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Retrieves a specific square by its own id.
   *
   * @param cellID the {@link UUID} of the square
   * @return the {@link PollCell}, if it exists, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static PollCell getCell(UUID cellID) throws SQLException {
    if(null == cellID) return null;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_cell",
                  "poll_option",
                  "poll_window")
              .where("id")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(cellID));
      res = stmt.executeQuery();

      if(res.next())
        return new PollCell(
            cellID,
            SQLBuilder.bytesToUUID(
                res.getBytes("poll_option")),
            SQLBuilder.bytesToUUID(
                res.getBytes("poll_window")));

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return null;
  }

  /**
   * Retrieves the square at a particular intersection.
   *
   * <p>Hand-built rather than assembled with {@link SQLBuilder} because the
   * all-day square is matched with {@code IS NULL}, and {@code = ?} bound to
   * NULL matches nothing at all — which would report every all-day square as
   * absent and let a second one be created beside the first.
   *
   * @param optionID the {@link UUID} of the column
   * @param windowID the {@link UUID} of the row, or {@code null} for all-day
   * @return the {@link PollCell}, if the square is offered, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static PollCell getCell(UUID optionID, UUID windowID) throws SQLException {
    if(null == optionID) return null;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          "SELECT id FROM " + YasssCore.getDB().getPrefix() + "poll_cell"
              + " WHERE poll_option = ? AND poll_window "
              + (null == windowID ? "IS NULL" : "= ?")
              + " LIMIT 1");
      stmt.setBytes(1, SQLBuilder.uuidToBytes(optionID));
      if(null != windowID) stmt.setBytes(2, SQLBuilder.uuidToBytes(windowID));
      res = stmt.executeQuery();

      if(res.next())
        return new PollCell(
            SQLBuilder.bytesToUUID(
                res.getBytes("id")),
            optionID,
            windowID);

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return null;
  }

  /**
   * Saves this {@link PollCell} to the database, updating it if it already
   * exists.
   *
   * @throws SQLException if a database malfunction occurs
   */
  public void commit() throws SQLException {
    Connection con = null;
    try {
      con = YasssCore.getDB().connect();
      commit(con);
    } finally {
      YasssCore.getDB().close(con, null, null);
    }
  }

  /**
   * Saves this {@link PollCell} on a caller-supplied connection.
   *
   * <p>The connection is the caller's and is deliberately not closed here.
   *
   * @param con the {@link Connection} to use
   * @throws SQLException if a database malfunction occurs
   */
  public void commit(Connection con) throws SQLException {
    PreparedStatement stmt = null;

    try {
      if(null == id) {
        ResultSet res = null;
        stmt = con.prepareStatement(
            new SQLBuilder()
                .select(
                    YasssCore.getDB().getPrefix() + "poll_cell",
                    "id")
                .where("id")
                .toString());

        boolean found;
        do {
          id = UUID.randomUUID();
          stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
          res = stmt.executeQuery();
          found = res.next();
          YasssCore.getDB().close(null, null, res);
        } while(found);

        YasssCore.getDB().close(null, stmt, null);
      }

      stmt = con.prepareStatement(
          new SQLBuilder()
              .update(
                  YasssCore.getDB().getPrefix() + "poll_cell",
                  "poll_option",
                  "poll_window")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(option));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(window));
      stmt.setBytes(3, SQLBuilder.uuidToBytes(id));

      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "poll_cell",
                    "id",
                    "poll_option",
                    "poll_window")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(option));
        stmt.setBytes(3, SQLBuilder.uuidToBytes(window));
        stmt.executeUpdate();
      }

    } finally {
      YasssCore.getDB().close(null, stmt, null);
    }
  }

  /**
   * Removes this {@link PollCell} from the database, if it exists.
   *
   * <p>Every vote cast on the square goes with it, by cascade. That is the
   * intended reading of an organiser withdrawing a square: nobody is on record
   * as having chosen a time that is no longer offered.
   *
   * @throws SQLException if a database malfunction occurs
   */
  public void delete() throws SQLException {
    if(null == id) return;

    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "poll_cell")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
}
