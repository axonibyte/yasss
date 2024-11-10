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
import com.axonibyte.lib.db.Wrapper;
import com.crowdease.yasss.YasssCore;

/**
 * Represents a volunteer's "sign-up" to an event.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class RSVP {
  
  private final UUID activity;
  private final UUID window;
  private final UUID volunteer;

  /**
   * Instantiates an RSVP.
   *
   * @param activity the {@link UUID} of the {@link Activity} associated with
   *        the {@link Slot} to which this {@link RSVP} is assigned
   * @param window the {@link UUID} of the {@link Window} associated with the
   *        {@link Slot} to which this {@link RSVP} is assigned
   * @param volunteer the {@link UUID} of the {@link Volunteer} on whose behalf
   *        this {@link RSVP} was submitted
   */
  public RSVP(UUID activity, UUID window, UUID volunteer) {
    this.activity = activity;
    this.window = window;
    this.volunteer = volunteer;
  }

  /**
   * Retrieves the unique identifier of the activity associated with this RSVP.
   *
   * @return the {@link UUID} of the {@link Activity}
   */
  public UUID getActivity() {
    return activity;
  }

  /**
   * Retrieves the unique identifier of the window associated with this RSVP.
   *
   * @return the {@link UUID} of the {@link Window}
   */
  public UUID getWindow() {
    return window;
  }

  /**
   * Retrieves the volunteer associated with this RSVP.
   *
   * @return the {@link Volunteer} associated with this {@link RSVP}
   */
  public Volunteer getVolunteer() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "volunteer",
                  "user",
                  "event",
                  "name",
                  "reminders_enabled",
                  "ip_addr")
              .where("id")
              .limit(1)
              .wrap(new Wrapper(5, "INET_NTOA"))
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(volunteer));
      res = stmt.executeQuery();
      
      if(res.next())
        return new Volunteer(
            volunteer,
            SQLBuilder.bytesToUUID(
                res.getBytes("user")),
            SQLBuilder.bytesToUUID(
                res.getBytes("event")),
            res.getString("name"),
            res.getBoolean("reminders_enabled"),
            res.getString("ip_addr"));
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return null;
  }

  /**
   * Saves this RSVP to the database. Any conflicting record is overwritten.
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
              .insertIgnore(
                  YasssCore.getDB().getPrefix() + "rsvp",
                  "activity",
                  "event_window",
                  "volunteer")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(window));
      stmt.setBytes(3, SQLBuilder.uuidToBytes(volunteer));
      stmt.executeUpdate();
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Removes this RSVP from the database.
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
                  YasssCore.getDB().getPrefix() + "rsvp")
              .where(
                  "activity",
                  "event_window",
                  "volunteer")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(window));
      stmt.setBytes(3, SQLBuilder.uuidToBytes(volunteer));
      stmt.executeUpdate();
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
  
}
