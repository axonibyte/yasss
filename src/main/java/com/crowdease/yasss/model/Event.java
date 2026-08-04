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
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;

import com.axonibyte.lib.db.Comparison;
import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.Wrapper;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder.Join;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

/**
 * Represents an event--a collection of activities, windows, volunteers, and
 * their respective RSVPS that represent attendees or helpers in a real-world
 * event.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class Event {

  /**
   * Retrieves an ordered set of events that conform to provided criteria.
   *
   * @param adminID the {@link UUID} of the {@link User} that is responsible for
   *        administrating the event
   * @param volunteerID the {@link UUID} of a {@link Volunteer} that has signed
   *        up for the event
   * @param labelSubstr a needle to search for in the haystack of event labels
   * @param earliest the inclusive lower bound for the event {@link Timestamp} criteria
   * @param latest the exclusive upper bound for the event {@link Timestamp} criteria
   * @return a {@link Set} of {@link Event} objects that meet the criteria
   * @throws SQLException if a database malfunction occurs
   */
  public static Set<Event> getEvents(UUID adminID, UUID volunteerID, String labelSubstr, Timestamp earliest, Timestamp latest) throws SQLException {
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
            "e.timezone",
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
                res.getBoolean("e.published"))
                .setTimezone(res.getString("e.timezone")));
      
      return events;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Retrieves an ordered set of events that conform to provided criteria.
   *
   * @param adminID the {@link UUID} of the {@link User} that is responsible for
   *        administrating the event
   * @param volunteerID the {@link UUID} of a {@link Volunteer} that has
   *        signed up for the event
   * @param labelSubstr a needle to search for in the haystack of event labels
   * @param earliest the inclusive lower bound for the event {@link Timestamp} criteria
   * @param page the number of the page to retrieve (i.e. the paginated set of
   *        results)
   * @param limit the maximum number of results to return (i.e. the page size cap)
   * @return a {@link Set} of {@link Event} objects that mett criteria
   * @throws SQLException if a database malfunction occurs
   */
  public static Set<Event> getEvents(UUID adminID, UUID volunteerID, String labelSubstr, Timestamp earliest, Integer page, Integer limit) throws SQLException {
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
            "e.timezone",
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
                res.getBoolean("e.published"))
                .setTimezone(res.getString("e.timezone")));
      
      return events;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Counts the number of events that meet the specified criteria.
   *
   * @param adminID the {@link UUID} of the {@link User} that is responsible for
   *        administrating the event
   * @param volunteerID the {@link UUID} of a {@link Volunteer} that has signed
   *        up for the event
   * @param labelSubstr a needle to search for in the haystack of event labels
   * @param earliest the inclusive lower bound for the event {@link Timestamp} criteria
   * @return the number of entries that would be returned in total, should this
   *         query be made, without regard to the pagination specification
   * @throws SQLException if a database malfunction occurs
   */
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

  /**
   * Retrieves a specific {@link Event} from the database.
   *
   * @param eventID the {@link UUID} of the {@link Event}
   * @return the {@link Event}, if it exists, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static Event getEvent(UUID eventID) throws SQLException {
    if(null == eventID) return null;
    
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
                  "published",
                  "timezone",
                  "reminder_lead_time")
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
            res.getBoolean("published"))
            .setTimezone(res.getString("timezone"))
            .setReminderLeadTime(
                null == res.getObject("reminder_lead_time")
                    ? null
                    : res.getInt("reminder_lead_time"));
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return null;
  }
  
  /** {@code setInt} cannot express NULL, and NULL is meaningful here. */
  private static void setNullableInt(PreparedStatement stmt, int idx, Integer value)
      throws SQLException {
    if(null == value) stmt.setNull(idx, java.sql.Types.INTEGER);
    else stmt.setInt(idx, value);
  }

  private UUID id = null;
  private UUID admin = null;
  private String shortDescription = null;
  private String longDescription = null;
  private Timestamp firstDraftTimestamp = null;
  private boolean emailOnSubmission = false;
  private boolean allowMultiUserSignups = false;
  private boolean isPublished = false;
  private String timezone = null;
  private Integer reminderLeadTime = null;

  /**
   * Instantiates an {@link Event}.
   *
   * @param id the unique ID of the {@link Event}
   * @param admin the unique ID of the {@link User} responsible for administrating
   *        the event
   * @param shortDescription the event's short description
   * @param longDescription the event's long description
   * @param firstDraftTimestamp the {@link Timestamp} corresponding to the date
   *        and time at which the event was first posted to the database
   * @param emailOnSubmission {@code true} if the admin should receive
   *        notifications when someone submits an RSVP
   * @param allowMultiUserSignups {@code true} if a single user should be allowed
   *        to sign more than one volunteer up at the same time
   * @param isPublished {@code true} iff this event is already published
   */
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
    this.isPublished = isPublished;
  }

  /**
   * Retrieves the IANA timezone the event takes place in.
   *
   * <p>{@code null} means it was never recorded, which is true of every event
   * created before the column existed. Those render in the viewer's own zone,
   * as they always have; only events carrying a zone render in it.
   *
   * @return an IANA zone id such as {@code America/Chicago}, or {@code null}
   */
  public String getTimezone() {
    return timezone;
  }

  /**
   * Sets the IANA timezone the event takes place in.
   *
   * @param timezone an IANA zone id, or {@code null} to leave it unrecorded
   * @return this {@link Event}, for chaining
   */
  public Event setTimezone(String timezone) {
    this.timezone = timezone;
    return this;
  }

  /**
   * Retrieves how many minutes before the event its reminders go out.
   *
   * @return the override in minutes, or {@code null} to use the global setting
   */
  public Integer getReminderLeadTime() {
    return reminderLeadTime;
  }

  /**
   * Sets how many minutes before the event its reminders go out.
   *
   * @param reminderLeadTime minutes, or {@code null} to use the global setting
   * @return this {@link Event}, for chaining
   */
  public Event setReminderLeadTime(Integer reminderLeadTime) {
    this.reminderLeadTime = reminderLeadTime;
    return this;
  }

  /**
   * Retrieves the event's unique identifier.
   *
   * @return the {@link UUID} of the {@link Event}
   */
  public UUID getID() {
    return id;
  }

  /**
   * Retrieves the unique identifier of the user responsible for administrating
   * this event.
   *
   * @return the {@link UUID} of the {@link Event} admin or {@code null} if no
   *         admin was ever specified
   */
  public UUID getAdmin() {
    return admin;
  }

  /**
   * Sets the unique identifier of the user responsible for administrating this
   * event.
   *
   * @return this {@link Event} instance
   */
  public Event setAdmin(UUID admin) {
    this.admin = admin;
    return this;
  }

  /**
   * Retrieves the event's short description.
   *
   * @return the short description associated with the {@link Event}
   */
  public String getShortDescription() {
    return shortDescription;
  }

  /**
   * Sets the event's short description.
   *
   * @param shortDescription the short description associated with the {@link Event}
   * @return this {@link Event} instance
   */
  public Event setShortDescription(String shortDescription) {
    this.shortDescription = shortDescription;
    return this;
  }

  /**
   * Retrieves the event's long description.
   *
   * @return the long description associated with the {@link Event}
   */
  public String getLongDescription() {
    return longDescription;
  }

  /**
   * Sets the event's long description.
   *
   * @param longDescription the long description associated with the {@link Event}
   * @return this {@link Event} instance
   */
  public Event setLongDescription(String longDescription) {
    this.longDescription = longDescription;
    return this;
  }

  /**
   * Retrieves the timestamp associated with this event's first date and time of
   * commit to the database.
   *
   * @return the {@link Timestamp} associated with the publishing of the first
   *         draft of this {@link Event}
   */
  public Timestamp getFirstDraftTimestamp() {
    return firstDraftTimestamp;
  }

  /**
   * Sets the timestamp associated with this event's first date and time of commit
   * to the database.
   *
   * @return this {@link Event} instance
   */
  public Event setFirstDraftTimestamp(Timestamp timestamp) {
    this.firstDraftTimestamp = timestamp;
    return this;
  }

  /**
   * Determines whether or not the admin (if they exist) should be notified when
   * a volunteer submits an RSVP.
   *
   * @return {@code true} iff admin email notifications are enabled
   */
  public boolean emailOnSubmissionEnabled() {
    return emailOnSubmission;
  }

  /**
   * Sets whether or not the admin (if they exist) should be notified when a
   * volunteer submits an RSVP.
   *
   * @param enabled {@code true} iff admin email notifications should be enabled
   * @return this {@link Event} instance
   */
  public Event enableEmailOnSubmission(boolean enabled) {
    this.emailOnSubmission = enabled;
    return this;
  }

  /**
   * Determines whether or not a single {@link User} is allowed to create more
   * than one {@link Volunteer} for this event.
   *
   * @return {@code true} if multi-user signups are enabled
   */
  public boolean allowMultiUserSignups() {
    return allowMultiUserSignups;
  }

  /**
   * Sets whether or not a single {@link User} is allowed to create more than one
   * {@link Volunteer} for this event.
   *
   * @return this {@link Event} instance
   */
  public Event allowMultiUserSignups(boolean allow) {
    this.allowMultiUserSignups = allow;
    return this;
  }

  /**
   * Determines whether or not this event has been published.
   *
   * @return {@code true} if this event was published
   */
  public boolean isPublished() {
    return isPublished;
  }

  /**
   * Sets whether or not this event should be published.
   *
   * @return this {@link Event} instance
   */
  public Event publish(boolean publish) {
    this.isPublished = publish;
    return this;
  }

  /**
   * Retrieves the details associated with this event.
   *
   * @return a {@link Set} of {@link Detail} objects
   * @throws SQLException if a database malfunction occurs
   */
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

  /**
   * Retrieves a specific event detail from thet database.
   *
   * @param detailID the {@link UUID} of the {@link Detail} in question
   * @return the {@link Detail}, if it exists; otherwise, {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public Detail getDetail(UUID detailID) throws SQLException {
    if(null == detailID) return null;
    
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

  /**
   * Retrieves the activities associated with this event.
   *
   * @return a {@link Set} of {@link Activity} objects
   * @throws SQLException if a database malfunction occurs
   */
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

  /**
   * Retrieves a specific activity from the database.
   *
   * @param activityID the {@link UUID} of the {@link Activity} in question
   * @return the {@link Activity}, if it exists; otherwise, {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public Activity getActivity(UUID activityID) throws SQLException {
    if(null == activityID) return null;
    
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

  /**
   * Retrieves the windows associated with this event.
   *
   * @return a {@link Set} of {@link Window} objects
   * @throws SQLException if a database malfunction occurs
   */
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

  /**
   * Retrieves a window from the database.
   *
   * @param windowID the {@link UUID} associated with the {@link Window} in
   *        question
   * @return the {@link Window}, if it exists; otherwise, {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public Window getWindow(UUID windowID) throws SQLException {
    if(null == windowID) return null;
    
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

  /**
   * Retrieves the volunteers associated with this event.
   *
   * @return a {@link Set} of {@link Volunteer} objects
   * @throws SQLException if a database malfunction occurs
   */
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
              "reminders_enabled",
              "ip_addr_bin",
              "reminder_email",
              "reminder_state",
              "reminder_token")
          .where("event")
          .order("name", Order.ASC)
          .wrap(new Wrapper(5, "INET6_NTOA"))
          .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();

      Set<Volunteer> volunteers = new LinkedHashSet<>();
      while(res.next())
        volunteers.add(
            new Volunteer(
                SQLBuilder.bytesToUUID(
                    res.getBytes("id")),
                SQLBuilder.bytesToUUID(
                    res.getBytes("user")),
                id,
                res.getString("name"),
                res.getBoolean("reminders_enabled"),
                res.getString("ip_addr_bin"))
                .setReminderEmail(res.getString("reminder_email"))
                .setReminderState(
                    Volunteer.ReminderState.fromOrdinal(
                        res.getInt("reminder_state")))
                .setReminderToken(
                    SQLBuilder.bytesToUUID(
                        res.getBytes("reminder_token"))));

      if(!volunteers.isEmpty()) {
        Map<UUID, Map<Detail, String>> details = new LinkedHashMap<>();
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
          details.put(volunteer.getID(), new TreeMap<>());
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

  /**
   * Counts volunteers associated with this event, optionally filtered.
   *
   * @param user the {@link UUID} of the user by which counted volunteers are
   *        to be filtered, or {@code null} to count volunteers without regard
   *        to their associated users
   * @param ipAddr the IP address by which counted volunteers are to be filtered,
   *        or {@code null} to count volunteers without regard to their associated
   *        IP addresses
   * @return a number representing the number of potentially-filtered volunteers
   *         associated with this event
   * @throws SQLException if a database malfunction occurs
   */
  public int countVolunteers(UUID user, String ipAddr) throws SQLException {
    Connection con = null;
    try {
      con = YasssCore.getDB().connect();
      return countVolunteers(con, user, ipAddr);
    } finally {
      YasssCore.getDB().close(con, null, null);
    }
  }

  /**
   * Signals that an identity has already signed up as many times as this event
   * permits.
   *
   * <p>Unchecked so that it can leave a
   * {@link com.axonibyte.lib.db.Database.TransactionalWork} lambda, which may
   * only declare {@link SQLException}.
   */
  public static final class IdentityCapException extends RuntimeException {
    public IdentityCapException() {
      super("this identity has already signed up for this event");
    }
  }

  /**
   * Takes this event's row lock.
   *
   * <p>The per-identity signup cap is a count followed by an insert, and
   * nothing used to hold the gap between them — so simultaneous signups from
   * one address all counted zero and all proceeded. This is what closes it, and
   * it has to be the <em>first</em> lock any signup takes: `RSVP.claimWithin`
   * then locks activity rows, and a lock order of event-then-activity in one
   * request and the reverse in another is a deadlock.
   *
   * <p>Only taken when the cap actually applies. Locking here unconditionally
   * would serialise every signup on an event that permits several, which is the
   * ordinary case and the one that most wants to be parallel.
   *
   * @param con the {@link Connection} running the transaction
   * @throws SQLException if a database malfunction occurs
   */
  public void lock(Connection con) throws SQLException {
    try(PreparedStatement stmt = con.prepareStatement(
        "SELECT id FROM " + YasssCore.getDB().getPrefix() + "event WHERE id = ? FOR UPDATE")) {
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.executeQuery().close();
    }
  }

  /**
   * Counts this event's volunteers on a caller-supplied connection.
   *
   * <p>The connection is the caller's and is deliberately not closed here.
   *
   * @param con the {@link Connection} to use
   * @param user the {@link UUID} of the account to scope to, or {@code null}
   * @param ipAddr the address to scope to, or {@code null}
   * @return the number of matching volunteers
   * @throws SQLException if a database malfunction occurs
   */
  public int countVolunteers(Connection con, UUID user, String ipAddr) throws SQLException {
    PreparedStatement stmt = null;
    ResultSet res = null;

    SQLBuilder query = new SQLBuilder()
      .select(
          YasssCore.getDB().getPrefix() + "volunteer")
      .count("id", "vol_count")
      .where("event");
    if(null != ipAddr)
      query
        .where("ip_addr_bin")
        .wrap(
            new Wrapper(2, "INET6_ATON"));
    // Was gated on (and bound to) `admin`, this event's owner, rather than the
    // `user` parameter -- so the per-user signup cap counted the wrong thing
    // entirely and could never be scoped to the caller.
    if(null != user)
      query.where("user");

    try {
      stmt = con.prepareStatement(query.toString());
      int idx = 0;
      // Bind in the same order the WHERE clauses were added above: event,
      // ip_addr, user. The previous order bound user before ip_addr, which
      // silently swapped the two whenever both filters were supplied. Callers
      // pass exactly one today, so it never bit -- but the INET6_ATON wrapper
      // is pinned to parameter 2, so the ordering is load-bearing.
      stmt.setBytes(++idx, SQLBuilder.uuidToBytes(id));
      if(null != ipAddr)
        stmt.setString(++idx, ipAddr);
      if(null != user)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(user));
      res = stmt.executeQuery();

      res.next();
      return res.getInt("vol_count");
      
    } catch(SQLException e) {
      throw e;
    } finally {
      // The statement and result set, not the connection: that is the caller's.
      YasssCore.getDB().close(null, stmt, res);
    }
  }

  /**
   * Retrieves a particular volunteer associated with this event.
   *
   * @param volunteerID the {@link UUID} associated with the {@link Volunteer}
   *        in question
   * @return the {@link Volunteer}, if it exists; otherwise, {@code null}
   */
  public Volunteer getVolunteer(UUID volunteerID) throws SQLException {
    if(null == volunteerID) return null;
    
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
              "reminders_enabled",
              "ip_addr_bin",
              "reminder_email",
              "reminder_state",
              "reminder_token")
          .where("id", "event")
          .limit(1)
          .wrap(new Wrapper(4, "INET6_NTOA"))
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
            res.getBoolean("reminders_enabled"),
            res.getString("ip_addr_bin"))
            .setReminderEmail(res.getString("reminder_email"))
            .setReminderState(
                Volunteer.ReminderState.fromOrdinal(
                    res.getInt("reminder_state")))
            .setReminderToken(
                SQLBuilder.bytesToUUID(
                    res.getBytes("reminder_token")));

    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return null;
  }

  /**
   * Determines whether or not this event has expired. The event is considered
   * expired if it has at least one window and the begin date of its earliest
   * window is before the current date and time.
   *
   * @return {@code true} iff this event has expired
   * @throws SQLException if a database malfunction occurs
   */
  public boolean isExpired() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
          .select(
              YasssCore.getDB().getPrefix() + "event_window",
              "begin_time")
          .where("event")
          .order("begin_time", Order.ASC)
          .limit(1)
          .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();

      if(res.next())
        return res.getTimestamp("begin_time").before(new Date());
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return false;
  }

  /**
   * Saves this {@link Event} to the database. If it already exists, it's merely
   * updated.
   *
   * @throws SQLException if a database malfunction occurs
   */
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
                  "published",
                  "timezone",
                  "reminder_lead_time")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(admin));
      stmt.setString(2, shortDescription);
      stmt.setString(3, longDescription);
      stmt.setTimestamp(4, firstDraftTimestamp);
      stmt.setBoolean(5, emailOnSubmission);
      stmt.setBoolean(6, allowMultiUserSignups);
      stmt.setBoolean(7, isPublished);
      stmt.setString(8, timezone);
      setNullableInt(stmt, 9, reminderLeadTime);
      stmt.setBytes(10, SQLBuilder.uuidToBytes(id));
      
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
                    "published",
                    "timezone",
                    "reminder_lead_time")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(admin));
        stmt.setString(3, shortDescription);
        stmt.setString(4, longDescription);
        stmt.setTimestamp(5, firstDraftTimestamp);
        stmt.setBoolean(6, emailOnSubmission);
        stmt.setBoolean(7, allowMultiUserSignups);
        stmt.setBoolean(8, isPublished);
        stmt.setString(9, timezone);
        setNullableInt(stmt, 10, reminderLeadTime);
        stmt.executeUpdate();
      }
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Removes this {@link Event} from the database.
   *
   * @throws SQLException if a database malfunction occurs
   */
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
