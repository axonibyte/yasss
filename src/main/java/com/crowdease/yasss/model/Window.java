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
import java.sql.Timestamp;
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.db.Comparison;
import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder.Join;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

/**
 * Models a window in an event. Intended to represent a window of time during
 * which a volunteer will be participating in some activity.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class Window implements Comparable<Window> {
  
  private UUID id = null;
  private UUID event = null;
  private Timestamp begin = null;
  private Timestamp end = null;

  /**
   * Instantiates a {@link Window}.
   *
   * @param id the {@link UUID} associated with this window
   * @param event the {@link UUID} associated with the event containing this window
   * @param begin the {@link Timestamp} denoting the date and time during which
   *        the window starts
   * @param end the {@link Timestamp} denoting the date and time during which the
   *        window ends
   */
  public Window(UUID id, UUID event, Timestamp begin, Timestamp end) {
    this.id = id;
    this.event = event;
    this.begin = begin;
    this.end = end;
  }

  /**
   * Retrieves the unique ID associated with this {@link Window}.
   *
   * @return the {@link UUID} of the {@link Window}.
   */
  public UUID getID() {
    return id;
  }

  /**
   * Retrieves the unique ID of the {@link Event} associated with this window.
   *
   * @return the {@link UUID} of the {@link Event}
   */
  public UUID getEvent() {
    return event;
  }

  /**
   * Sets the unique ID of the {@link Event} associated with this window.
   *
   * @param event the {@link UUID} of the {@link Event}
   * @return this {@link Window} instance
   */
  public Window setEvent(UUID event) {
    this.event = event;
    return this;
  }

  /**
   * Determines the date and time at which this window begins.
   *
   * @return a {@link Timestamp} denoting with the window's start time
   */
  public Timestamp getBeginTime() {
    return begin;
  }

  /**
   * Sets the date and time at which this window begins.
   *
   * @param beginTime the {@link Timestamp} denoting with the window's start time
   */
  public Window setBeginTime(Timestamp beginTime) {
    this.begin = beginTime;
    return this;
  }

  /**
   * Determines the date and time at which this window ends.
   *
   * @return a {@link Timestamp} denoting with the window's end time
   */
  public Timestamp getEndTime() {
    return end;
  }

  /**
   * Sets the date and time at which this window ends.
   *
   * @param endTime the {@link Timestamp} denoting the window's end time
   */
  public Window setEndTime(Timestamp endTime) {
    this.end = endTime;
    return this;
  }

  /**
   * Retrieves all slots associated with this window.
   *
   * @return a {@link Set} of {@link Slot} objects
   */
  public Set<Slot> getSlots() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "slot",
                  "s.activity",
                  "s.max_slot_volunteers")
              .tableAlias("s")
              .join(
                  Join.INNER,
                  YasssCore.getDB().getPrefix() + "activity",
                  "a",
                  new Comparison("s.activity", "a.id", ComparisonOp.EQUAL_TO))
              .where("s.event_window")
              .order("a.priority", Order.ASC)
              .order("a.short_description", Order.ASC)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();
      
      Set<Slot> slots = new LinkedHashSet<>();
      while(res.next())
        slots.add(
            new Slot(
                SQLBuilder.bytesToUUID(
                    res.getBytes("s.activity")),
                id,
                res.getInt("s.max_slot_volunteers")));
      return slots;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Retrieves a specific {@link Slot} associated with this {@link Window}.
   *
   * @param activityID the {@link UUID} associated with the {@link Activity} with
   *        which this {@link Window} forms an intersection manifesting as the
   *        desired {@link Slot}
   * @return the {@link Slot} that forms the intersection of this {@link Window}
   *         and the provided {@link Activity} {@link UUID}, if it exists;
   *         otherwise, {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public Slot getSlot(UUID activityID) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "slot",
                  "max_slot_volunteers")
              .where("activity")
              .where("window")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activityID));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();
      
      if(res.next())
        return new Slot(
            activityID,
            id,
            res.getInt("max_slot_volunteers"));
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return null;
  }

  /**
   * Saves this {@link Window} to the database. If it already exists, it is
   * merely updated.
   *
   * @throws SQLException if a database malfunction occurs
   */
  public void commit() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    
    try {
      con = YasssCore.getDB().connect();
      
      if(null == id) {
        ResultSet res = null;
        stmt = con.prepareStatement(
            new SQLBuilder()
                .select(
                    YasssCore.getDB().getPrefix() + "event_window",
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
        
        YasssCore.getDB().close(null, stmt, res);
      }
      
      stmt = con.prepareStatement(
          new SQLBuilder()
              .update(
                  YasssCore.getDB().getPrefix() + "event_window",
                  "event",
                  "begin_time",
                  "end_time")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(event));
      stmt.setTimestamp(2, begin);
      stmt.setTimestamp(3, end);
      stmt.setBytes(4, SQLBuilder.uuidToBytes(id));
      
      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "event_window",
                    "id",
                    "event",
                    "begin_time",
                    "end_time")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(event));
        stmt.setTimestamp(3, begin);
        stmt.setTimestamp(4, end);
        stmt.executeUpdate();
      }
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Removes this {@link Window} from the database.
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
                  YasssCore.getDB().getPrefix() + "event_window")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.executeUpdate();
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * {@inheritDoc}
   */
  @Override public int compareTo(Window window) {
    Objects.requireNonNull(window);
    int c;
    return 0 == (c = compareTimes(begin, window.end))
        ? compareTimes(end, window.end)
        : c;
  }
  
  private int compareTimes(Timestamp a, Timestamp b) {
    return null == a ? (null == b ? 0 : 1) : (null == b ? -1 : a.compareTo(b));
  }
  
}
