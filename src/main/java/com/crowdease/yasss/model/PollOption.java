/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.Objects;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;

/**
 * One column of a {@link Poll}'s grid: a day of the week, or a specific date.
 *
 * <p>Which of the two it is follows the poll's {@link Poll.Scope}, and exactly
 * one of {@code dayOfWeek} and {@code date} is ever set — a database CHECK says
 * so, because it is the invariant a buggy endpoint could actually violate.
 * Weekdays are ISO-8601 numbered, Monday through Sunday as 1 through 7, which
 * is what {@link java.time.DayOfWeek#getValue()} returns, so nothing anywhere
 * has to do arithmetic on them.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public class PollOption implements Comparable<PollOption> {

  private UUID id = null;
  private UUID poll = null;
  private Integer dayOfWeek = null;
  private Date date = null;
  private boolean allDay = false;
  private int priority = 0;

  /**
   * Instantiates a {@link PollOption}.
   *
   * @param id the {@link UUID} of this option, or {@code null} if uncommitted
   * @param poll the {@link UUID} of the {@link Poll} this belongs to
   * @param dayOfWeek the ISO-8601 weekday, or {@code null} on an absolute poll
   * @param date the specific date, or {@code null} on a relative poll
   * @param allDay {@code true} iff this column asks about the whole day
   * @param priority this option's ordering weight
   */
  public PollOption(UUID id, UUID poll, Integer dayOfWeek, Date date, boolean allDay, int priority) {
    this.id = id;
    this.poll = poll;
    this.dayOfWeek = dayOfWeek;
    this.date = date;
    this.allDay = allDay;
    this.priority = priority;
  }

  /**
   * Retrieves the {@link UUID} associated with this {@link PollOption}.
   *
   * @return this option's {@link UUID}
   */
  public UUID getID() {
    return id;
  }

  /**
   * Retrieves the {@link UUID} of the {@link Poll} this option belongs to.
   *
   * @return the poll's {@link UUID}
   */
  public UUID getPoll() {
    return poll;
  }

  /**
   * Sets the {@link UUID} of the {@link Poll} this option belongs to.
   *
   * @param poll the poll's {@link UUID}
   * @return this {@link PollOption} instance
   */
  public PollOption setPoll(UUID poll) {
    this.poll = poll;
    return this;
  }

  /**
   * Retrieves the ISO-8601 weekday this option names.
   *
   * @return the weekday, 1 through 7, or {@code null} if this option names a date
   */
  public Integer getDayOfWeek() {
    return dayOfWeek;
  }

  /**
   * Sets the ISO-8601 weekday this option names, clearing any date.
   *
   * @param dayOfWeek the weekday, 1 through 7
   * @return this {@link PollOption} instance
   */
  public PollOption setDayOfWeek(Integer dayOfWeek) {
    this.dayOfWeek = dayOfWeek;
    // Cleared together rather than independently: the CHECK constraint permits
    // exactly one of the pair, so a setter that left the other in place would
    // turn an ordinary edit into a constraint violation at commit time, a long
    // way from the call that caused it.
    if(null != dayOfWeek) this.date = null;
    return this;
  }

  /**
   * Retrieves the specific date this option names.
   *
   * @return the {@link Date}, or {@code null} if this option names a weekday
   */
  public Date getDate() {
    return date;
  }

  /**
   * Sets the specific date this option names, clearing any weekday.
   *
   * @param date the {@link Date}
   * @return this {@link PollOption} instance
   */
  public PollOption setDate(Date date) {
    this.date = date;
    if(null != date) this.dayOfWeek = null;
    return this;
  }

  /**
   * Determines whether this option names a weekday rather than a date.
   *
   * @return {@code true} iff this option names a weekday
   */
  public boolean isRelative() {
    return null != dayOfWeek;
  }

  /**
   * Determines whether this column asks about the whole day.
   *
   * <p>When set, the column's timed squares stop being offered and a single
   * all-day square takes their place. Deliberately non-destructive: the timed
   * {@link PollCell} rows stay exactly where they are, so unticking this
   * restores the column as it was rather than making the organizer rebuild it.
   *
   * @return {@code true} iff this option is an all-day column
   */
  public boolean isAllDay() {
    return allDay;
  }

  /**
   * Sets whether this column asks about the whole day.
   *
   * @param allDay {@code true} iff this option is an all-day column
   * @return this {@link PollOption} instance
   */
  public PollOption setAllDay(boolean allDay) {
    this.allDay = allDay;
    return this;
  }

  /**
   * Retrieves this option's ordering weight.
   *
   * @return the priority
   */
  public int getPriority() {
    return priority;
  }

  /**
   * Sets this option's ordering weight.
   *
   * @param priority the priority
   * @return this {@link PollOption} instance
   */
  public PollOption setPriority(int priority) {
    this.priority = priority;
    return this;
  }

  /**
   * Retrieves a specific {@link PollOption} from the database.
   *
   * @param optionID the {@link UUID} of the option
   * @return the {@link PollOption}, if it exists, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static PollOption getOption(UUID optionID) throws SQLException {
    if(null == optionID) return null;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_option",
                  "poll",
                  "day_of_week",
                  "option_date",
                  "all_day",
                  "priority")
              .where("id")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(optionID));
      res = stmt.executeQuery();

      if(res.next()) return from(optionID, res);

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return null;
  }

  /**
   * Builds an option from a row that already carries every column.
   *
   * <p>Shared by the single-row lookup and {@link Poll#getOptions()} so the
   * nullable-column handling exists once. Reading {@code day_of_week} through
   * {@code getObject} first is load-bearing: {@code getInt} answers zero for
   * SQL NULL, and zero is not a weekday but is not obviously not one either.
   *
   * @param optionID the option's {@link UUID}
   * @param res the {@link ResultSet}, positioned on the row
   * @return the {@link PollOption}
   * @throws SQLException if a database malfunction occurs
   */
  static PollOption from(UUID optionID, ResultSet res) throws SQLException {
    return new PollOption(
        optionID,
        SQLBuilder.bytesToUUID(
            res.getBytes("poll")),
        null == res.getObject("day_of_week") ? null : res.getInt("day_of_week"),
        res.getDate("option_date"),
        res.getBoolean("all_day"),
        res.getInt("priority"));
  }

  /**
   * Saves this {@link PollOption} to the database, updating it if it already
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
   * Saves this {@link PollOption} on a caller-supplied connection.
   *
   * <p>The connection is the caller's and is deliberately not closed here — an
   * option and the cells that a standing window rule creates for it have to
   * land or fail together.
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
                    YasssCore.getDB().getPrefix() + "poll_option",
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
                  YasssCore.getDB().getPrefix() + "poll_option",
                  "poll",
                  "day_of_week",
                  "option_date",
                  "all_day",
                  "priority")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(poll));
      setNullableInt(stmt, 2, dayOfWeek);
      stmt.setDate(3, date);
      stmt.setBoolean(4, allDay);
      stmt.setInt(5, priority);
      stmt.setBytes(6, SQLBuilder.uuidToBytes(id));

      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "poll_option",
                    "id",
                    "poll",
                    "day_of_week",
                    "option_date",
                    "all_day",
                    "priority")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(poll));
        setNullableInt(stmt, 3, dayOfWeek);
        stmt.setDate(4, date);
        stmt.setBoolean(5, allDay);
        stmt.setInt(6, priority);
        stmt.executeUpdate();
      }

    } finally {
      YasssCore.getDB().close(null, stmt, null);
    }
  }

  /** {@code setInt} cannot express NULL, and NULL is meaningful here. */
  private static void setNullableInt(PreparedStatement stmt, int idx, Integer value)
      throws SQLException {
    if(null == value) stmt.setNull(idx, Types.INTEGER);
    else stmt.setInt(idx, value);
  }

  /**
   * Removes this {@link PollOption} from the database, if it exists.
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
                  YasssCore.getDB().getPrefix() + "poll_option")
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
  @Override public int compareTo(PollOption option) {
    Objects.requireNonNull(option);
    int c;
    if(0 != (c = Integer.compare(priority, option.priority))) return c;
    // Then by what the column actually names, so an organizer who never touched
    // the ordering still gets Monday before Tuesday and the 3rd before the 4th.
    // The two kinds never mix within a poll -- the scope decides which it is --
    // so a null on one side means the other is a different kind of poll
    // entirely, and only the id tiebreak can say anything useful about it.
    if(null != dayOfWeek && null != option.dayOfWeek
        && 0 != (c = Integer.compare(dayOfWeek, option.dayOfWeek))) return c;
    if(null != date && null != option.date
        && 0 != (c = date.compareTo(option.date))) return c;
    return Activity.compareIDs(getID(), option.getID());
  }
}
