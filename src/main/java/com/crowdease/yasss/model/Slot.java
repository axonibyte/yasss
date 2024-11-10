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
import com.axonibyte.lib.db.Wrapper;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder.Join;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

/**
 * Represents the intersection of an activity and a window.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class Slot {
  
  private final UUID activity;
  private final UUID window;
  
  private int maxSlotVolunteers = -1;

  /**
   * Instantiates the slot.
   *
   * @param activity the {@link UUID} of the {@link Activity} associated with
   *        this {@link Slot}
   * @param window the {@link UUID} of the {@link Window} associated with this
   *        {@link Slot}
   * @param maxSlotVolunteers the maximum number of volunteers permitted to sign
   *        up for this slot (or {@code 0} if an infinite number of volunteers
   *        should be be permitted to sign up)
   */
  public Slot(UUID activity, UUID window, int maxSlotVolunteers) {
    this.activity = activity;
    this.window = window;
    this.maxSlotVolunteers = maxSlotVolunteers;
  }

  /**
   * Retrieves the unique ID of the activity associated with this slot.
   *
   * @return the {@link UUID} of the {@link Activity}
   */
  public UUID getActivity() {
    return activity;
  }

  /**
   * Retrieves the unique ID of the window associated with this slot.
   *
   * @return the {@link UUID} of the {@link Window}
   */
  public UUID getWindow() {
    return window;
  }

  /**
   * Retrieves the maximum number of volunteers that will be permitted to
   * volunteer for this slot.
   *
   * @return the localized volunteer cap for this slot
   */
  public int getMaxSlotVolunteers() {
    return maxSlotVolunteers;
  }

  /**
   * Sets the maximum number of volunteers that will be permitted to volunteer
   * for this slot.
   *
   * @return this {@link Slot} instance
   */
  public Slot setMaxSlotVolunteers(int maxVolunteers) {
    this.maxSlotVolunteers = maxVolunteers;
    return this;
  }

  /**
   * Retrieves the RSVPS (and linked volunteers) associated with this slot.
   *
   * @return a {@link Map} of {@link RSVP} keys and their respective
   *         {@link Volunteer} values
   */
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
                  "v.reminders_enabled",
                  "v.ip_addr")
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
              .wrap(new Wrapper(6, "INET_NTOA"))
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
                res.getBoolean("v.reminders_enabled"),
                res.getString("v.ip_addr")));
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

  /**
   * Counts the RSVPS associated with this particular slot.
   *
   * @return the {@link RSVP} count for this {@link Slot}
   */
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

  /**
   * Retrieves a particular RSVP and its associated volunteer.
   *
   * @return an {@link Entry} with an {@link RSVP} as its key and a
   *         {@link Volunteer} as its value
   */
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
                  "v.reminders_enabled",
                  "v.ip_addr")
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
              .wrap(new Wrapper(5, "INET_NTOA"))
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
                res.getBoolean("v.reminders_enabled"),
                res.getString("v.ip_addr")));
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return null;
  }

  /**
   * Saves this RSVP to the database. If it already exists, the entry is simply
   * updated.
   *
   * @throws SQLException if a database malfunction occurs
   */
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

  /**
   * Removes this {@link Slot} from the database.
   *
   * @throws SQLException if a database malfunction occurs
   */
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
