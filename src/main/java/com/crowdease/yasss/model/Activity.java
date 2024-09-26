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
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.db.Comparison;
import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder.Join;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

public class Activity implements Comparable<Activity> {
  
  private UUID id = null;
  private UUID event = null;
  private String shortDescription = null;
  private String longDescription = null;
  private int maxActivityVolunteers = -1;
  private int maxSlotVolunteersDefault = -1;
  private int priority = 0;
  
  public Activity(UUID id, UUID event, String shortDescription, String longDescription,
      int maxActivityVolunteers, int maxSlotVolunteersDefault, int priority) {
    this.id = id;
    this.event = event;
    this.shortDescription = shortDescription;
    this.longDescription = longDescription;
    this.maxActivityVolunteers = maxActivityVolunteers;
    this.maxSlotVolunteersDefault = maxSlotVolunteersDefault;
    this.priority = priority;
  }
  
  public UUID getID() {
    return id;
  }
  
  public UUID getEvent() {
    return event;
  }
  
  public Activity setEvent(UUID event) {
    this.event = event;
    return this;
  }
  
  public String getShortDescription() {
    return shortDescription;
  }
  
  public Activity setShortDescription(String shortDescription) {
    this.shortDescription = shortDescription;
    return this;
  }
  
  public String getLongDescription() {
    return longDescription;
  }
  
  public Activity setLongDescription(String longDescription) {
    this.longDescription = longDescription;
    return this;
  }
  
  public int getMaxActivityVolunteers() {
    return maxActivityVolunteers;
  }
  
  public Activity setMaxActivityVolunteers(int maxVolunteers) {
    this.maxActivityVolunteers = maxVolunteers;
    return this;
  }
  
  public int getMaxSlotVolunteersDefault() {
    return maxSlotVolunteersDefault;
  }
  
  public Activity setMaxSlotVolunteersDefault(int maxVolunteers) {
    this.maxSlotVolunteersDefault = maxVolunteers;
    return this;
  }
  
  public int getPriority() {
    return priority;
  }
  
  public Activity setPriority(int priority) {
    this.priority = priority;
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
                  "s.event_window",
                  "s.max_slot_volunteers")
              .tableAlias("s")
              .join(
                  Join.INNER,
                  YasssCore.getDB().getPrefix() + "event_window",
                  "w",
                  new Comparison("s.event_window", "w.id", ComparisonOp.EQUAL_TO))
              .where("s.activity")
              .order("w.begin_time", Order.ASC)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();
      
      Set<Slot> slots = new LinkedHashSet<>();
      while(res.next())
        slots.add(
            new Slot(
                id,
                SQLBuilder.bytesToUUID(
                    res.getBytes("s.window")),
                res.getInt("s.max_slot_volunteers")));
      return slots;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }
  
  public Slot getSlot(UUID windowID) throws SQLException {
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
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(windowID));
      res = stmt.executeQuery();
      
      if(res.next())
        return new Slot(
            id,
            windowID,
            res.getInt("max_slot_volunteers"));
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return null;
  }
  
  public int countRSVPs() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(YasssCore.getDB().getPrefix() + "rsvp")
              .count("*", "rsvp_count")
              .where("activity")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();
      
      res.next();
      return res.getInt("rsvp_count");
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
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
                    YasssCore.getDB().getPrefix() + "activity",
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
                  YasssCore.getDB().getPrefix() + "activity",
                  "event",
                  "short_description",
                  "long_description",
                  "max_activity_volunteers",
                  "max_slot_volunteers_default",
                  "priority")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(event));
      stmt.setString(2, shortDescription);
      stmt.setString(3, longDescription);
      stmt.setInt(4, maxActivityVolunteers);
      stmt.setInt(5, maxSlotVolunteersDefault);
      stmt.setInt(6, priority);
      stmt.setBytes(7, SQLBuilder.uuidToBytes(id));
      
      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "activity",
                    "id",
                    "event",
                    "short_description",
                    "long_description",
                    "max_activity_volunteers",
                    "max_slot_volunteers_default",
                    "priority")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(event));
        stmt.setString(3, shortDescription);
        stmt.setString(4, longDescription);
        stmt.setInt(5, maxActivityVolunteers);
        stmt.setInt(6, maxSlotVolunteersDefault);
        stmt.setInt(7, priority);
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
                  YasssCore.getDB().getPrefix() + "activity")
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
  
  @Override public int compareTo(Activity activity) {
    Objects.requireNonNull(activity);
    int c;
    return 0 == (c = Integer.compare(priority, activity.priority))
        ? shortDescription.compareToIgnoreCase(activity.shortDescription)
        : c;
  }
  
}
