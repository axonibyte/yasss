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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.AbstractMap.SimpleEntry;
import java.util.Map.Entry;

import com.axonibyte.lib.db.Comparison;
import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder.Join;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

public class Slot {
  
  private final UUID activity;
  private final UUID window;
  
  private int maxSlotVolunteers = -1;
  
  public Slot(UUID activity, UUID window, int maxSlotVolunteers) {
    this.activity = activity;
    this.window = window;
    this.maxSlotVolunteers = maxSlotVolunteers;
  }
  
  public UUID getActivity() {
    return activity;
  }
  
  public UUID getWindow() {
    return window;
  }
  
  public int getMaxSlotVolunteers() {
    return maxSlotVolunteers;
  }
  
  public Slot setMaxSlotVolunteers(int maxVolunteers) {
    this.maxSlotVolunteers = maxVolunteers;
    return this;
  }
  
  public Map<RSVP, Volunteer> getRSVPs() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "rsvp",
                  "v.id",
                  "v.user",
                  "v.event",
                  "v.name",
                  "v.reminders_enabled")
              .tableAlias("r")
              .join(
                  Join.INNER,
                  YasssCore.getDB().getPrefix() + "volunteer",
                  "v",
                  new Comparison(
                      "r.volunteer",
                      "v.id",
                      ComparisonOp.EQUAL_TO))
              .where("r.activity", "r.event_window")
              .order("r.last_update", Order.ASC)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(window));
      res = stmt.executeQuery();
      
      Map<RSVP, Volunteer> rsvps = new LinkedHashMap<>();
      while(res.next()) {
        UUID volunteer = SQLBuilder.bytesToUUID(
            res.getBytes("v.id"));
        rsvps.put(
            new RSVP(activity, window, volunteer),
            new Volunteer(
                volunteer,
                SQLBuilder.bytesToUUID(
                    res.getBytes("v.user")),
                SQLBuilder.bytesToUUID(
                    res.getBytes("v.event")),
                res.getString("v.name"),
                res.getBoolean("v.reminders_enabled")));
      }

      if(!rsvps.isEmpty()) {
        Map<UUID, Map<Detail, String>> details = new HashMap<>();
        YasssCore.getDB().close(null, stmt, res);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .select(
                    YasssCore.getDB().getPrefix() + "volunteer_detail",
                    "volunteer",
                    "detail_field",
                    "detail_value")
                .whereIn("volunteer", false, rsvps.size())
                .order("volunteer", Order.ASC)
                .toString());
        
        Event event = null;
        int idx = 0;
        for(var volunteer : rsvps.values()) {
          if(null == event)
            event = Event.getEvent(volunteer.getEvent());
          details.put(volunteer.getID(), new HashMap<>());
          stmt.setBytes(++idx, SQLBuilder.uuidToBytes(volunteer.getID()));
        }
        res = stmt.executeQuery();
        
        while(res.next())
          details
              .get(
                  SQLBuilder.bytesToUUID(
                      res.getBytes("volunteer")))
              .put(
                  event.getDetail(
                      SQLBuilder.bytesToUUID(
                          res.getBytes("detail_field"))),
                  res.getString("detail_value"));
        
        for(var volunteer : rsvps.values())
          volunteer.setDetails(
              details.get(
                  volunteer.getID()));
      }
      
      return rsvps;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
  }
  
  public int countRSVPs() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "rsvp")
              .count("v.id", "rsvp_count")
              .tableAlias("r")
              .join(
                  Join.INNER,
                  YasssCore.getDB().getPrefix() + "volunteer",
                  "v",
                  new Comparison(
                      "r.volunteer",
                      "v.id",
                      ComparisonOp.EQUAL_TO))
              .where("r.activity", "r.event_window")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(window));
      res = stmt.executeQuery();
      
      res.next();
      return res.getInt("rsvp_count");
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }
  
  public Entry<RSVP, Volunteer> getRSVP(UUID volunteerID) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "rsvp",
                  "v.user",
                  "v.event",
                  "v.name",
                  "v.reminders_enabled")
              .tableAlias("r")
              .join(
                  Join.INNER,
                  YasssCore.getDB().getPrefix() + "volunteer",
                  "v",
                  new Comparison(
                      "r.volunteer",
                      "v.id",
                      ComparisonOp.EQUAL_TO))
              .where(
                  "r.activity",
                  "r.event_window",
                  "r.volunteer")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(window));
      stmt.setBytes(3, SQLBuilder.uuidToBytes(volunteerID));
      res = stmt.executeQuery();
      
      if(res.next())
        return new SimpleEntry<>(
            new RSVP(activity, window, volunteerID),
            new Volunteer(
                volunteerID,
                SQLBuilder.bytesToUUID(
                    res.getBytes("v.user")),
                SQLBuilder.bytesToUUID(
                    res.getBytes("v.event")),
                res.getString("v.name"),
                res.getBoolean("v.reminders_enabled")));
      
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
      stmt = con.prepareStatement(
          new SQLBuilder()
              .update(
                  YasssCore.getDB().getPrefix() + "slot",
                  "max_slot_volunteers")
              .where(
                  "activity",
                  "event_window")
              .toString());
      stmt.setInt(1, maxSlotVolunteers);
      stmt.setBytes(2, SQLBuilder.uuidToBytes(activity));
      stmt.setBytes(3, SQLBuilder.uuidToBytes(window));
      
      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "slot",
                    "activity",
                    "event_window",
                    "max_slot_volunteers")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(window));
        stmt.setInt(3, maxSlotVolunteers);
        stmt.executeUpdate();
      }
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
  
  public void delete() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "slot")
              .where(
                  "activity",
                  "event_window")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(window));
      stmt.executeUpdate();
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
  
}
