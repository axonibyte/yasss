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
import java.util.Map;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;

public class Volunteer {
  
  private final UUID event;
  
  private UUID id;
  private UUID user;
  private String name;
  private Map<Detail, String> details = new HashMap<>();
  private boolean remindersEnabled;
  
  public Volunteer(UUID id, UUID user, UUID event, String name, boolean remindersEnabled) {
    this.id = id;
    this.user = user;
    this.event = event;
    this.name = name;
    this.remindersEnabled = remindersEnabled;
  }
  
  public UUID getID() {
    return id;
  }
  
  public UUID getEvent() {
    return event;
  }
  
  public UUID getUser() {
    return user;
  }
  
  public Volunteer setUser(UUID user) {
    this.user = user;
    return this;
  }

  public String getName() {
    return name;
  }

  public Volunteer setName(String name) {
    this.name = name;
    return this;
  }
  
  public Map<Detail, String> getDetails() {
    return Map.copyOf(details);
  }
  
  public Volunteer setDetails(Map<Detail, String> details) {
    this.details = Map.copyOf(details);
    return this;
  }
  
  public boolean remindersEnabled() {
    return remindersEnabled;
  }
  
  public Volunteer enableReminders(boolean enabled) {
    this.remindersEnabled = enabled;
    return this;
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
                  "reminders_enabled")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(user));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(event));
      stmt.setString(3, name);
      stmt.setBoolean(4, remindersEnabled);
      stmt.setBytes(5, SQLBuilder.uuidToBytes(id));
      
      boolean updated = 0 == stmt.executeUpdate();
      YasssCore.getDB().close(null, stmt, null);
      
      if(updated) { // record doesn't exist, so make it
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "volunteer",
                    "id",
                    "user",
                    "event",
                    "name",
                    "reminders_enabled")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(user));
        stmt.setBytes(3, SQLBuilder.uuidToBytes(event));
        stmt.setString(4, name);
        stmt.setBoolean(5, remindersEnabled);
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
