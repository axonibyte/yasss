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
import java.sql.Time;
import java.util.Objects;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;

/**
 * One row of a {@link Poll}'s grid: a candidate start time.
 *
 * <p>A start time and nothing else. A {@link Window} on an {@link Event} is a
 * pair of instants because an event is a thing that happens on a date; a poll
 * asks "can you make nine?" of a column that supplies the date — or, on a
 * relative poll, supplies only a weekday and no date at all. There is
 * deliberately no end time: the duration is the event's business, once the poll
 * has settled the hour.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public class PollWindow implements Comparable<PollWindow> {

  private UUID id = null;
  private UUID poll = null;
  private Time startTime = null;
  private boolean appliesToNewOptions = false;

  /**
   * Instantiates a {@link PollWindow}.
   *
   * @param id the {@link UUID} of this window, or {@code null} if uncommitted
   * @param poll the {@link UUID} of the {@link Poll} this belongs to
   * @param startTime the time of day this window starts
   * @param appliesToNewOptions {@code true} iff a {@link PollOption} added
   *        later should automatically be offered this window
   */
  public PollWindow(UUID id, UUID poll, Time startTime, boolean appliesToNewOptions) {
    this.id = id;
    this.poll = poll;
    this.startTime = startTime;
    this.appliesToNewOptions = appliesToNewOptions;
  }

  /**
   * Retrieves the {@link UUID} associated with this {@link PollWindow}.
   *
   * @return this window's {@link UUID}
   */
  public UUID getID() {
    return id;
  }

  /**
   * Retrieves the {@link UUID} of the {@link Poll} this window belongs to.
   *
   * @return the poll's {@link UUID}
   */
  public UUID getPoll() {
    return poll;
  }

  /**
   * Sets the {@link UUID} of the {@link Poll} this window belongs to.
   *
   * @param poll the poll's {@link UUID}
   * @return this {@link PollWindow} instance
   */
  public PollWindow setPoll(UUID poll) {
    this.poll = poll;
    return this;
  }

  /**
   * Retrieves the time of day at which this window begins.
   *
   * @return the start {@link Time}
   */
  public Time getStartTime() {
    return startTime;
  }

  /**
   * Sets the time of day at which this window begins.
   *
   * @param startTime the start {@link Time}
   * @return this {@link PollWindow} instance
   */
  public PollWindow setStartTime(Time startTime) {
    this.startTime = startTime;
    return this;
  }

  /**
   * Determines whether an option added after this window should automatically
   * be offered it.
   *
   * <p>This is the organiser's "apply to future days/dates" choice, kept as a
   * standing rule rather than expanded once when it was made. The distinction
   * is the whole of the feature: a column added a week later has to pick the
   * window up, and a one-time expansion cannot reach forward in time.
   *
   * @return {@code true} iff new options inherit this window
   */
  public boolean appliesToNewOptions() {
    return appliesToNewOptions;
  }

  /**
   * Sets whether an option added after this window should automatically be
   * offered it.
   *
   * @param applies {@code true} iff new options inherit this window
   * @return this {@link PollWindow} instance
   */
  public PollWindow setAppliesToNewOptions(boolean applies) {
    this.appliesToNewOptions = applies;
    return this;
  }

  /**
   * Retrieves a specific {@link PollWindow} from the database.
   *
   * @param windowID the {@link UUID} of the window
   * @return the {@link PollWindow}, if it exists, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static PollWindow getWindow(UUID windowID) throws SQLException {
    if(null == windowID) return null;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_window",
                  "poll",
                  "start_time",
                  "applies_to_new_options")
              .where("id")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(windowID));
      res = stmt.executeQuery();

      if(res.next())
        return new PollWindow(
            windowID,
            SQLBuilder.bytesToUUID(
                res.getBytes("poll")),
            res.getTime("start_time"),
            res.getBoolean("applies_to_new_options"));

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return null;
  }

  /**
   * Saves this {@link PollWindow} to the database, updating it if it already
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
   * Saves this {@link PollWindow} on a caller-supplied connection.
   *
   * <p>The connection is the caller's and is deliberately not closed here:
   * creating a poll writes its options, windows and cells in one transaction,
   * and a window that committed on its own connection would survive a rollback
   * of everything around it.
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
                    YasssCore.getDB().getPrefix() + "poll_window",
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
                  YasssCore.getDB().getPrefix() + "poll_window",
                  "poll",
                  "start_time",
                  "applies_to_new_options")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(poll));
      stmt.setTime(2, startTime);
      stmt.setBoolean(3, appliesToNewOptions);
      stmt.setBytes(4, SQLBuilder.uuidToBytes(id));

      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "poll_window",
                    "id",
                    "poll",
                    "start_time",
                    "applies_to_new_options")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(poll));
        stmt.setTime(3, startTime);
        stmt.setBoolean(4, appliesToNewOptions);
        stmt.executeUpdate();
      }

    } finally {
      YasssCore.getDB().close(null, stmt, null);
    }
  }

  /**
   * Removes this {@link PollWindow} from the database, if it exists.
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
                  YasssCore.getDB().getPrefix() + "poll_window")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * {@inheritDoc}
   */
  @Override public int compareTo(PollWindow window) {
    Objects.requireNonNull(window);
    int c;
    if(0 != (c = startTime.compareTo(window.startTime))) return c;
    // As in Activity and Detail: these collect into a TreeSet, and the unique
    // index makes two windows at one time impossible in the database -- but an
    // uncommitted pair on their way in has no index protecting it, and losing
    // one silently to a comparator that called them equal is how that would
    // show up.
    return Activity.compareIDs(getID(), window.getID());
  }
}
