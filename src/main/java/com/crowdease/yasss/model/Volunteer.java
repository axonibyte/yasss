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
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.Wrapper;
import com.crowdease.yasss.YasssCore;

/**
 * Represents a volunteer that has signed up for an event.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class Volunteer {
  
  private final UUID event;
  
  private UUID id;
  private UUID user;
  private String name;
  private String ipAddr;
  private Map<Detail, String> details = new HashMap<>();
  private boolean remindersEnabled;

  /**
   * Instantiates a volunteer.
   *
   * @param id the {@link UUID} of the {@link Volunteer}
   * @param user the {@link UUID} of the associated {@link User}, if one has
   *        been linked
   * @param event the {@link UUID} of the {@link Event} that the {@link Volunteer}
   *        has signed up for
   * @param remindersEnabled {@code true} iff the volunteer should be sent
   *        notifications when the event is about to start
   * @param ipAddr the IP address of the actor responsible for creating this
   *        volunteer
   */
  public Volunteer(UUID id, UUID user, UUID event, String name, boolean remindersEnabled, String ipAddr) {
    this.id = id;
    this.user = user;
    this.event = event;
    this.name = name;
    this.remindersEnabled = remindersEnabled;
    this.ipAddr = ipAddr;
  }

  /**
   * Retrieves the volunteers's unique identifier.
   *
   * @return the {@link UUID} of the {@link Volunteer}
   */
  public UUID getID() {
    return id;
  }

  /**
   * Retrieves the associated event's unique identifier.
   *
   * @return the {@link UUID} of the {@link Event} associated with this
   *         {@link Volunteer}
   */
  public UUID getEvent() {
    return event;
  }

  /**
   * Retrieves the associated user's unique identifier, if said user exists.
   *
   * @return the {@link UUID} of the {@link User} associated with this
   *         {@link Volunteer}, if such a user exists
   */
  public UUID getUser() {
    return user;
  }

  /**
   * Sets the associated user's unique identifier.
   *
   * @param user the {@link UUID} of the {@link User} associated with this
   *        {@link Volunteer} or {@code null} if no such user exists
   * @return this {@link Volunteer} instance
   */
  public Volunteer setUser(UUID user) {
    this.user = user;
    return this;
  }

  /**
   * Retrieves the associated user's IP address. An IP address should be returned,
   * even if a {@link User} account was not created and associated with this
   * volunteer.
   *
   * @return the creator's IP address
   */
  public String userIP() {
    return ipAddr;
  }

  /**
   * Sets the IP address associated with the actor that created this volunteer.
   *
   * @param the creator's IP address
   * @return this {@link Volunteer} instance
   */
  public Volunteer setUserIP(String ipAddr) {
    this.ipAddr = ipAddr;
    return this;
  }

  /**
   * Retrieves the volunteer's name.
   *
   * @return the name of the volunteer
   */
  public String getName() {
    return name;
  }

  /**
   * Sets the volunteer's name.
   *
   * @param name the name of the volunteer
   * @return the {@link Volunteer} instance
   */
  public Volunteer setName(String name) {
    this.name = name;
    return this;
  }

  /**
   * Retrieves the details associated with the volunteer.
   *
   * @return a {@link Map} of {@link Detail} keys and their associated values;
   *         the returned map is a copy of the internal map, so modifications
   *         must be recommitted via {@link Volunteer#setDetails(Map)}
   */
  public Map<Detail, String> getDetails() {
    return Collections.unmodifiableMap(
        new TreeMap<>(details));
  }

  /**
   * Sets the details associated with the volunteer. This method entirely
   * replaces any existing details.
   *
   * @param details a {@link Map} of {@link Detail} keys and their associated
   *        values; a copy of the provided map is used internally, so further
   *        modification of the map must be recommitted
   * @return the {@link Volunteer} instance
   */
  public Volunteer setDetails(Map<Detail, String> details) {
    this.details = new TreeMap<>(details);
    return this;
  }

  /**
   * Retrieves any RSVPs associated with this volunteer.
   *
   * @return a {@link Set} of {@link RSVP} objects
   * @throws SQLException if a database malfunction occurs
   */
  public Set<RSVP> getRSVPS() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    Set<RSVP> rsvps = new HashSet<>();
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "rsvp",
                  "activity",
                  "event_window")
              .where("volunteer")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();
      
      while(res.next())
        rsvps.add(
            new RSVP(
                SQLBuilder.bytesToUUID(
                    res.getBytes("activity")),
                SQLBuilder.bytesToUUID(
                    res.getBytes("event_window")),
                id));
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return rsvps;
  }

  /**
   * Determines whether or not reminders are enabled for this volunteer.
   *
   * @return {@code true} iff reminders are enabled for this volunteer
   */
  public boolean remindersEnabled() {
    return remindersEnabled;
  }

  /**
   * Sets whether or not reminders are enabled for this volunteer.
   *
   * @param enabled {@code true} iff reminders should be enabled for this volunteer
   * @return the {@link Volunteer} instance
   */
  public Volunteer enableReminders(boolean enabled) {
    this.remindersEnabled = enabled;
    return this;
  }

  /**
   * Saves the {@link Volunteer} to the database. If it already exists, then the
   * corresponding record will be updated.
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
                YasssCore.getDB().getPrefix() + "volunteer",
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
                  YasssCore.getDB().getPrefix() + "volunteer",
                  "user",
                  "event",
                  "name",
                  "reminders_enabled",
                  "ip_addr")
              .where("id")
              .wrap(new Wrapper(5, "INET_ATON"))
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(user));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(event));
      stmt.setString(3, name);
      stmt.setBoolean(4, remindersEnabled);
      stmt.setString(5, ipAddr);
      stmt.setBytes(6, SQLBuilder.uuidToBytes(id));
      
      boolean noRecord = 0 == stmt.executeUpdate();
      YasssCore.getDB().close(null, stmt, null);
      
      if(noRecord) { // record doesn't exist, so make it
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "volunteer",
                    "id",
                    "user",
                    "event",
                    "name",
                    "reminders_enabled",
                    "ip_addr")
                .wrap(new Wrapper(6, "INET_ATON"))
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(user));
        stmt.setBytes(3, SQLBuilder.uuidToBytes(event));
        stmt.setString(4, name);
        stmt.setBoolean(5, remindersEnabled);
        stmt.setString(6, ipAddr);
        stmt.executeUpdate();
        
      } else { // record existed, so wipe stale deets
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .delete(
                    YasssCore.getDB().getPrefix() + "volunteer_detail")
                .where("volunteer")
                .whereIn(
                    "detail_field",
                    true,
                    details.size())
                .toString());
        int idx = 0;
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(id));
        for(var detail : details.keySet())
          stmt.setBytes(++idx, SQLBuilder.uuidToBytes(detail.getID()));
        stmt.executeUpdate();
      }
      
      Map<UUID, String> missingDeets = new HashMap<>();
      if(!details.isEmpty()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .update(
                    YasssCore.getDB().getPrefix() + "volunteer_detail",
                    "detail_value")
                .where(
                    "volunteer",
                    "detail_field")
                .toString());
        stmt.setBytes(2, SQLBuilder.uuidToBytes(id));
        for(var detail : details.entrySet()) {
          stmt.setString(1, detail.getValue());
          stmt.setBytes(3, SQLBuilder.uuidToBytes(detail.getKey().getID()));
          if(0 == stmt.executeUpdate())
            missingDeets.put(detail.getKey().getID(), detail.getValue());
        }
      }
      
      if(!missingDeets.isEmpty()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "volunteer_detail",
                    "volunteer",
                    "detail_field",
                    "detail_value")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        for(var detail : missingDeets.entrySet()) {
          stmt.setBytes(2, SQLBuilder.uuidToBytes(detail.getKey()));
          stmt.setString(3, detail.getValue());
          stmt.executeUpdate();
        }
      }
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Removes the volunteer from the database.
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
                  YasssCore.getDB().getPrefix() + "volunteer")
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
  
}
