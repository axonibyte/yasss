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

public class Window implements Comparable<Window> {
  
  private UUID id = null;
  private UUID event = null;
  private Timestamp begin = null;
  private Timestamp end = null;
  
  public Window(UUID id, UUID event, Timestamp begin, Timestamp end) {
    this.id = id;
    this.event = event;
    this.begin = begin;
    this.end = end;
  }
  
  public UUID getID() {
    return id;
  }
  
  public UUID getEvent() {
    return event;
  }
  
  public Window setEvent(UUID event) {
    this.event = event;
    return this;
  }
  
  public Timestamp getBeginTime() {
    return begin;
  }
  
  public Window setBeginTime(Timestamp beginTime) {
    this.begin = beginTime;
    return this;
  }
  
  public Timestamp getEndTime() {
    return end;
  }
  
  public Window setEndTime(Timestamp endTime) {
    this.end = endTime;
    return this;
  }
  
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
                .where("id")
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
