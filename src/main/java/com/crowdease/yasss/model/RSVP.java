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
import com.crowdease.yasss.YasssCore;

public class RSVP {
  
  private final UUID activity;
  private final UUID window;
  private final UUID volunteer;
  
  public RSVP(UUID activity, UUID window, UUID volunteer) {
    this.activity = activity;
    this.window = window;
    this.volunteer = volunteer;
  }
  
  public UUID getActivity() {
    return activity;
  }
  
  public UUID getWindow() {
    return window;
  }
  
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
                  "reminders_enabled")
              .where("id")
              .limit(1)
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
            res.getBoolean("reminders_enabled"));
      
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
