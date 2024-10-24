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
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import com.axonibyte.lib.db.Comparison;
import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder.Join;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

public class Event {
  
  public static Set<Event> getEvents(UUID adminID, UUID volunteerID, String labelSubstr, Timestamp earliest,
      Timestamp latest) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    SQLBuilder query = new SQLBuilder()
        .select(
            YasssCore.getDB().getPrefix() + "event",
            "e.id",
            "e.admin_user",
            "e.short_description",
            "e.long_description",
            "e.first_draft",
            "e.email_on_submission",
            "e.allow_multiuser_signups",
            "e.published",
            "w.begin_time")
        .tableAlias("e")
        .join(
            Join.INNER,
            new SQLBuilder()
                .select(
                    YasssCore.getDB().getPrefix() + "event_window",
                    "event")
                .min("begin_time", "begin_time")
                .group("event"),
            "w",
            new Comparison("e.id", "w.event", ComparisonOp.EQUAL_TO))
        .order("w.begin_time", Order.ASC);
    
    if(null != volunteerID)
      query
          .join(
              Join.INNER,
              YasssCore.getDB().getPrefix() + "volunteer",
              "v",
              new Comparison("e.id", "v.event", ComparisonOp.EQUAL_TO))
          .where("v.user", ComparisonOp.EQUAL_TO);
    if(null != adminID)
      query.where("e.admin_user", ComparisonOp.EQUAL_TO);
    if(null != labelSubstr)
      query.where("e.short_description", ComparisonOp.LIKE);
    if(null != earliest)
      query.where("w.begin_time", ComparisonOp.GREATER_THAN_OR_EQUAL_TO);
    if(null != latest)
      query.where("w.begin_time", ComparisonOp.LESS_THAN);
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(query.toString());
      
      int idx = 0;
      if(null != volunteerID)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(volunteerID));
      if(null != adminID)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(adminID));
      if(null != labelSubstr)
        stmt.setString(++idx, labelSubstr);
      if(null != earliest)
        stmt.setTimestamp(++idx, earliest);
      if(null != latest)
        stmt.setTimestamp(++idx, latest);
      
      res = stmt.executeQuery();
      
      Set<Event> events = new LinkedHashSet<>();
      while(res.next())
        events.add(
            new Event(
                SQLBuilder.bytesToUUID(
                    res.getBytes("e.id")),
                SQLBuilder.bytesToUUID(
                    res.getBytes("e.admin_user")),
                res.getString("e.short_description"),
                res.getString("e.long_description"),
                res.getTimestamp("e.first_draft"),
                res.getBoolean("e.email_on_submission"),
                res.getBoolean("e.allow_multiuser_signups"),
                res.getBoolean("e.published")));
      
      return events;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }
  
  public static Set<Event> getEvents(UUID adminID, UUID volunteerID, String labelSubstr, Timestamp earliest,
      Integer page, Integer limit) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    SQLBuilder query = new SQLBuilder()
        .select(
            YasssCore.getDB().getPrefix() + "event",
            "e.id",
            "e.admin_user",
            "e.short_description",
            "e.long_description",
            "e.first_draft",
            "e.email_on_submission",
            "e.allow_multiuser_signups",
            "e.published",
            "w.begin_time")
        .tableAlias("e")
        .join(
            Join.INNER,
            new SQLBuilder()
                .select(
                    YasssCore.getDB().getPrefix() + "event_window",
                    "event")
                .min("begin_time", "begin_time")
                .group("event"),
            "w",
            new Comparison("e.id", "w.event", ComparisonOp.EQUAL_TO))
        .order("w.begin_time", Order.ASC);
    
    if(null != volunteerID)
      query
          .join(
              Join.INNER,
              YasssCore.getDB().getPrefix() + "volunteer",
              "v",
              new Comparison("e.id", "v.event", ComparisonOp.EQUAL_TO))
          .where("v.user", ComparisonOp.EQUAL_TO);
    if(null != adminID)
      query.where("e.admin_user", ComparisonOp.EQUAL_TO);
    if(null != labelSubstr)
      query.where("e.short_description", ComparisonOp.LIKE);
    if(null != earliest)
      query.where("w.begin_time", ComparisonOp.GREATER_THAN_OR_EQUAL_TO);
    if(null != page)
      query.limit(limit, limit * (page - 1));
    else if(null != limit)
      query.limit(limit);
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(query.toString());
      
      int idx = 0;
      if(null != volunteerID)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(volunteerID));
      if(null != adminID)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(adminID));
      if(null != labelSubstr)
        stmt.setString(++idx, labelSubstr);
      if(null != earliest)
        stmt.setTimestamp(++idx, earliest);
      
      res = stmt.executeQuery();
      
      Set<Event> events = new LinkedHashSet<>();
      while(res.next())
        events.add(
            new Event(
                SQLBuilder.bytesToUUID(
                    res.getBytes("e.id")),
                SQLBuilder.bytesToUUID(
                    res.getBytes("e.admin_user")),
                res.getString("e.short_description"),
                res.getString("e.long_description"),
                res.getTimestamp("e.first_draft"),
                res.getBoolean("e.email_on_submission"),
                res.getBoolean("e.allow_multiuser_signups"),
                res.getBoolean("e.published")));
      
      return events;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }
  
  public static int countEvents(UUID adminID, UUID volunteerID, String labelSubstr, Timestamp earliest)
      throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    SQLBuilder query = new SQLBuilder()
        .select(
            YasssCore.getDB().getPrefix() + "event")
        .count("e.id", "event_count")
        .tableAlias("e")
        .join(
            Join.INNER,
            new SQLBuilder()
                .select(
                    YasssCore.getDB().getPrefix() + "event_window",
                    "event")
                .min("begin_time", "begin_time")
                .group("event"),
            "w",
            new Comparison("e.id", "w.event", ComparisonOp.EQUAL_TO));
    
    if(null != volunteerID)
      query
          .join(
              Join.INNER,
              YasssCore.getDB().getPrefix() + "volunteer",
              "v",
              new Comparison("e.id", "v.event", ComparisonOp.EQUAL_TO))
          .where("v.user", ComparisonOp.EQUAL_TO);
    if(null != adminID)
      query.where("e.admin_user", ComparisonOp.EQUAL_TO);
    if(null != labelSubstr)
      query.where("e.short_description", ComparisonOp.LIKE);
    if(null != earliest)
      query.where("w.begin_time", ComparisonOp.GREATER_THAN_OR_EQUAL_TO);
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(query.toString());
      
      int idx = 0;
      if(null != volunteerID)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(volunteerID));
      if(null != adminID)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(adminID));
      if(null != labelSubstr)
        stmt.setString(++idx, labelSubstr);
      if(null != earliest)
        stmt.setTimestamp(++idx, earliest);
      
      res = stmt.executeQuery();
      res.next();
      return res.getInt("event_count");
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }
  
  public static Event getEvent(UUID eventID) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "event",
                  "admin_user",
                  "short_description",
                  "long_description",
                  "first_draft",
                  "email_on_submission",
                  "allow_multiuser_signups",
                  "published")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(eventID));
      res = stmt.executeQuery();
      
      if(res.next())
        return new Event(
            eventID,
            SQLBuilder.bytesToUUID(
                res.getBytes("admin_user")),
            res.getString("short_description"),
            res.getString("long_description"),
            res.getTimestamp("first_draft"),
            res.getBoolean("email_on_submission"),
            res.getBoolean("allow_multiuser_signups"),
            res.getBoolean("published"));
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return null;
  }
  
  private UUID id = null;
  private UUID admin = null;
  private String shortDescription = null;
  private String longDescription = null;
  private Timestamp firstDraftTimestamp = null;
  private boolean emailOnSubmission = false;
  private boolean allowMultiUserSignups = false;
  private boolean isPublished = false;
  
  public Event(UUID id, UUID admin, String shortDescription, String longDescription,
      Timestamp firstDraftTimestamp, boolean emailOnSubmission,
      boolean allowMultiUserSignups, boolean isPublished) {
    this.id = id;
    this.admin = admin;
    this.shortDescription = shortDescription;
    this.longDescription = longDescription;
    this.firstDraftTimestamp = firstDraftTimestamp;
    this.emailOnSubmission = emailOnSubmission;
    this.allowMultiUserSignups = allowMultiUserSignups;
  }
  
  public UUID getID() {
    return id;
  }
  
  public UUID getAdmin() {
    return admin;
  }
  
  public Event setAdmin(UUID admin) {
    this.admin = admin;
    return this;
  }
  
  public String getShortDescription() {
    return shortDescription;
  }
  
  public Event setShortDescription(String shortDescription) {
    this.shortDescription = shortDescription;
    return this;
  }
  
  public String getLongDescription() {
    return longDescription;
  }
  
  public Event setLongDescription(String longDescription) {
    this.longDescription = longDescription;
    return this;
  }
  
  public Timestamp getFirstDraftTimestamp() {
    return firstDraftTimestamp;
  }
  
  public Event setFirstDraftTimestamp(Timestamp timestamp) {
    this.firstDraftTimestamp = timestamp;
    return this;
  }
  
  public boolean emailOnSubmissionEnabled() {
    return emailOnSubmission;
  }
  
  public Event enableEmailOnSubmission(boolean enabled) {
    this.emailOnSubmission = enabled;
    return this;
  }
  
  public boolean allowMultiUserSignups() {
    return allowMultiUserSignups;
  }
  
  public Event allowMultiUserSignups(boolean allow) {
    this.allowMultiUserSignups = allow;
    return this;
  }
  
  public boolean isPublished() {
    return isPublished;
  }
  
  public Event publish(boolean publish) {
    this.isPublished = publish;
    return this;
  }
  
  public Set<Detail> getDetails() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "detail",
                  "id",
                  "detail_type",
                  "label",
                  "hint",
                  "priority",
                  "required")
              .where("event")
              .order("priority", Order.ASC)
              .order("label", Order.ASC)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();
      
      Set<Detail> details = new TreeSet<>();
      while(res.next())
        details.add(
            new Detail(
                SQLBuilder.bytesToUUID(
                    res.getBytes("id")),
                id,
                Detail.Type.values()[res.getInt("detail_type")],
                res.getString("label"),
                res.getString("hint"),
                res.getInt("priority"),
                res.getBoolean("required")));
      return details;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }
  
  public Detail getDetail(UUID detailID) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "detail",
                  "event",
                  "detail_type",
                  "label",
                  "hint",
                  "priority",
                  "required")
              .where("id")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(detailID));
      res = stmt.executeQuery();
      
      if(res.next())
        return new Detail(
            detailID,
            SQLBuilder.bytesToUUID(
                res.getBytes("event")),
            Detail.Type.values()[res.getInt("detail_type")],
            res.getString("label"),
            res.getString("hint"),
            res.getInt("priority"),
            res.getBoolean("required"));
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return null;
  }
  
  public Set<Activity> getActivities() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "activity",
                  "id",
                  "short_description",
                  "long_description",
                  "max_activity_volunteers",
                  "max_slot_volunteers_default",
                  "priority")
              .where("event")
              .order("priority", Order.ASC)
              .order("short_description", Order.ASC)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();
      
      Set<Activity> activities = new TreeSet<>();
      while(res.next())
        activities.add(
            new Activity(
                SQLBuilder.bytesToUUID(
                    res.getBytes("id")),
                id,
                res.getString("short_description"),
                res.getString("long_description"),
                res.getInt("max_activity_volunteers"),
                res.getInt("max_slot_volunteers_default"),
                res.getInt("priority")));
      return activities;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }
  
  public Activity getActivity(UUID activityID) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "activity",
                  "event",
                  "short_description",
                  "long_description",
                  "max_activity_volunteers",
                  "max_slot_volunteers_default",
                  "priority")
              .where("id")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activityID));
      res = stmt.executeQuery();
      
      if(res.next())
        return new Activity(
            activityID,
            SQLBuilder.bytesToUUID(
                res.getBytes("event")),
            res.getString("short_description"),
            res.getString("long_description"),
            res.getInt("max_activity_volunteers"),
            res.getInt("max_slot_volunteers_default"),
            res.getInt("priority"));
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return null;
  }
  
  public Set<Window> getWindows() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "event_window",
                  "id",
                  "begin_time",
                  "end_time")
              .where("event")
              .order("begin_time", Order.ASC)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();
      
      Set<Window> windows = new TreeSet<>();
      while(res.next())
        windows.add(
            new Window(
                SQLBuilder.bytesToUUID(
                    res.getBytes("id")),
                id,
                res.getTimestamp("begin_time"),
                res.getTimestamp("end_time")));
      return windows;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }
  
  public Window getWindow(UUID windowID) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "event_window",
                  "event",
                  "begin_time",
                  "end_time")
              .where("id")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(windowID));
      res = stmt.executeQuery();
      
      if(res.next())
        return new Window(
            windowID,
            SQLBuilder.bytesToUUID(
                res.getBytes("event")),
            res.getTimestamp("begin_time"),
            res.getTimestamp("end_time"));
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
    
    return null;
  }

  public Set<Volunteer> getVolunteers() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
          .select(
              YasssCore.getDB().getPrefix() + "volunteer",
              "id",
              "user",
              "name",
              "reminders_enabled")
          .where("event")
          .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();

      Set<Volunteer> volunteers = new HashSet<>();
      while(res.next())
        volunteers.add(
            new Volunteer(
                SQLBuilder.bytesToUUID(
                    res.getBytes("id")),
                SQLBuilder.bytesToUUID(
                    res.getBytes("user")),
                id,
                res.getString("name"),
                res.getBoolean("reminders_enabled")));

      if(!volunteers.isEmpty()) {
        Map<UUID, Map<Detail, String>> details = new HashMap<>();
        YasssCore.getDB().close(null, stmt, res);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .select(
                    YasssCore.getDB().getPrefix() + "volunteer_detail",
                    "volunteer",
                    "detail_field",
                    "detail_value")
                .whereIn("volunteer", false, volunteers.size())
                .order("volunteer", Order.ASC)
                .toString());
        
        int idx = 0;
        for(var volunteer : volunteers) {
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
                  getDetail(
                      SQLBuilder.bytesToUUID(
                          res.getBytes("detail_field"))),
                  res.getString("detail_value"));
        
        for(var volunteer : volunteers)
          if(details.containsKey(volunteer.getID()))
            volunteer.setDetails(
                details.get(volunteer.getID()));
        
      }
      
      return volunteers;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  public Volunteer getVolunteer(UUID volunteerID) throws SQLException {
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
              "name",
              "reminders_enabled")
          .where("id", "event")
          .limit(1)
          .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(volunteerID));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();

      if(res.next())
        return new Volunteer(
            volunteerID,
            SQLBuilder.bytesToUUID(
                res.getBytes("user")),
            id,
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
    
    if(null == id) {
      do {
        id = UUID.randomUUID();
      } while(null != getEvent(id));
    }
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .update(
                  YasssCore.getDB().getPrefix() + "event",
                  "admin_user",
                  "short_description",
                  "long_description",
                  "first_draft",
                  "email_on_submission",
                  "allow_multiuser_signups",
                  "published")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(admin));
      stmt.setString(2, shortDescription);
      stmt.setString(3, longDescription);
      stmt.setTimestamp(4, firstDraftTimestamp);
      stmt.setBoolean(5, emailOnSubmission);
      stmt.setBoolean(6, allowMultiUserSignups);
      stmt.setBoolean(7, isPublished);
      stmt.setBytes(8, SQLBuilder.uuidToBytes(id));
      
      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "event",
                    "id",
                    "admin_user",
                    "short_description",
                    "long_description",
                    "first_draft",
                    "email_on_submission",
                    "allow_multiuser_signups",
                    "published")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(admin));
        stmt.setString(3, shortDescription);
        stmt.setString(4, longDescription);
        stmt.setTimestamp(5, firstDraftTimestamp);
        stmt.setBoolean(6, emailOnSubmission);
        stmt.setBoolean(7, allowMultiUserSignups);
        stmt.setBoolean(8, isPublished);
        stmt.executeUpdate();
      }
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
  
  public void delete() throws SQLException {
    if(null == getID()) return;
    
    Connection con = null;
    PreparedStatement stmt = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "user")
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
