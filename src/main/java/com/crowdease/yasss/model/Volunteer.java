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
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import com.axonibyte.lib.db.Comparison;
import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.Wrapper;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder.Join;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

/**
 * Represents a volunteer that has signed up for an event.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class Volunteer {

  /**
   * Whether this volunteer has consented to being emailed.
   *
   * <p>Distinct from {@code remindersEnabled}, which is the volunteer's intent.
   * This is the consent fact, and the daemon requires both -- an address that
   * has not been confirmed is not one we may write to, however keen its owner
   * was at signup.
   *
   * <p>The ordinal is persisted, so the order of these constants is part of the
   * schema and must not be rearranged.
   */
  public static enum ReminderState {

    /** No address supplied, or reminders never requested. */
    NONE,

    /** An address is on file and a confirmation has been sent. */
    PENDING,

    /** The address is confirmed and may be written to. */
    CONFIRMED,

    /** The recipient asked to stop. Never send again. */
    UNSUBSCRIBED;

    /**
     * Resolves a persisted ordinal, defaulting to {@link #NONE}.
     *
     * @param ordinal the stored value
     * @return the corresponding {@link ReminderState}
     */
    public static ReminderState fromOrdinal(int ordinal) {
      ReminderState[] values = values();
      return 0 <= ordinal && ordinal < values.length ? values[ordinal] : NONE;
    }
  }
  
  private final UUID event;
  
  private UUID id;
  private UUID user;
  private String name;
  private String ipAddr;
  private Map<Detail, String> details = new HashMap<>();
  private boolean remindersEnabled;
  private String reminderEmail = null;
  private ReminderState reminderState = ReminderState.NONE;
  private UUID reminderToken = null;

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
      
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return rsvps;
  }

  /**
   * Retrieves the address reminders are sent to, if any.
   *
   * Deliberately separate from the linked account's address: `user` is null for
   * an anonymous signup, which is a first-class path, and an address collected
   * by an organizer as a custom field is not consent for the platform to write.
   *
   * @return the address, or {@code null}
   */
  public String getReminderEmail() {
    return reminderEmail;
  }

  /**
   * Sets the address reminders are sent to.
   *
   * @param reminderEmail the address, or {@code null} to clear it
   * @return this {@link Volunteer}
   */
  public Volunteer setReminderEmail(String reminderEmail) {
    this.reminderEmail = reminderEmail;
    return this;
  }

  /**
   * Retrieves this volunteer's consent state.
   *
   * @return the {@link ReminderState}
   */
  public ReminderState getReminderState() {
    return reminderState;
  }

  /**
   * Sets this volunteer's consent state.
   *
   * @param reminderState the {@link ReminderState}
   * @return this {@link Volunteer}
   */
  public Volunteer setReminderState(ReminderState reminderState) {
    this.reminderState = null == reminderState ? ReminderState.NONE : reminderState;
    return this;
  }

  /**
   * Retrieves the durable secret backing this volunteer's confirm and
   * unsubscribe links.
   *
   * @return the token, or {@code null}
   */
  public UUID getReminderToken() {
    return reminderToken;
  }

  /**
   * Sets the durable secret backing the confirm and unsubscribe links.
   *
   * @param reminderToken the token, or {@code null} to clear it
   * @return this {@link Volunteer}
   */
  public Volunteer setReminderToken(UUID reminderToken) {
    this.reminderToken = reminderToken;
    return this;
  }

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
    try {
      con = YasssCore.getDB().connect();
      commit(con);
    } finally {
      YasssCore.getDB().close(con, null, null);
    }
  }

  /**
   * Saves the {@link Volunteer} on a caller-supplied connection.
   *
   * <p>Exists so that a signup can be one transaction rather than several
   * independent ones. `AddVolunteerEndpoint` has to count existing volunteers,
   * insert this one, and claim its seats without anything slipping in between;
   * doing that means the count, the insert and the claims all sharing a
   * connection with a lock held across them.
   *
   * <p>The connection is the caller's and is deliberately not closed here — it
   * is theirs to commit, roll back and return to the pool.
   *
   * @param con the {@link Connection} to use
   * @throws SQLException if a database malfunction occurs
   */
  public void commit(Connection con) throws SQLException {
    PreparedStatement stmt = null;

    try {
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
                  "ip_addr_bin",
                  "reminder_email",
                  "reminder_state",
                  "reminder_token")
              .where("id")
              .wrap(new Wrapper(5, "INET6_ATON"))
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(user));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(event));
      stmt.setString(3, name);
      stmt.setBoolean(4, remindersEnabled);
      stmt.setString(5, ipAddr);
      stmt.setString(6, reminderEmail);
      stmt.setInt(7, reminderState.ordinal());
      stmt.setBytes(8, SQLBuilder.uuidToBytes(reminderToken));
      stmt.setBytes(9, SQLBuilder.uuidToBytes(id));
      
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
                    "ip_addr_bin",
                    "reminder_email",
                    "reminder_state",
                    "reminder_token")
                .wrap(new Wrapper(6, "INET6_ATON"))
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(user));
        stmt.setBytes(3, SQLBuilder.uuidToBytes(event));
        stmt.setString(4, name);
        stmt.setBoolean(5, remindersEnabled);
        stmt.setString(6, ipAddr);
        stmt.setString(7, reminderEmail);
        stmt.setInt(8, reminderState.ordinal());
        stmt.setBytes(9, SQLBuilder.uuidToBytes(reminderToken));
        stmt.executeUpdate();
        
      } else { // record existed, so wipe stale deets
        YasssCore.getDB().close(null, stmt, null);

        // whereIn() with a count of zero emits a literal "NOT IN ()", which is a
        // syntax error -- so re-committing a volunteer on an event that has no
        // custom fields used to fail outright. Semantically an empty set means
        // "none of these should survive", so the clause is simply dropped.
        SQLBuilder wipe = new SQLBuilder()
            .delete(
                YasssCore.getDB().getPrefix() + "volunteer_detail")
            .where("volunteer");
        if(!details.isEmpty())
          wipe.whereIn(
              "detail_field",
              true,
              details.size());

        stmt = con.prepareStatement(wipe.toString());
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
      
    } finally {
      // The statement, not the connection: that belongs to the caller.
      YasssCore.getDB().close(null, stmt, null);
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
      
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
  

  /**
   * A volunteer who is due a reminder, with everything needed to send it.
   *
   * @param volunteerID the volunteer
   * @param eventID the event they signed up for
   * @param volunteerName their name, for the greeting
   * @param recipient the confirmed address to write to
   * @param token the durable secret backing the unsubscribe link
   * @param eventTitle the event's short description
   * @param windowBegin when the event's earliest window starts
   */
  public static record PendingReminder(
      UUID volunteerID,
      UUID eventID,
      String volunteerName,
      String recipient,
      UUID token,
      String eventTitle,
      Timestamp windowBegin) { }

  /**
   * Finds volunteers due a reminder.
   *
   * <p>Selects those who both asked for one and confirmed an address, on a
   * published event whose earliest window begins inside the lead time, skipping
   * anything already claimed in the send ledger and any address suppressed
   * platform-wide.
   *
   * <p>The lower bound on {@code begin_time} is load-bearing rather than
   * defensive: without it the first sweep after deploying would find every past
   * event whose volunteers have no ledger row and send reminders for things
   * that finished years ago.
   *
   * @param now the lower bound -- events already begun are not reminded about
   * @param globalLeadMinutes the configured lead time, used for events that
   *        do not override it
   * @param limit the most rows to return in one sweep
   * @return the volunteers due a reminder, earliest first
   * @throws SQLException if a database malfunction occurs
   */
  public static List<PendingReminder> getPendingReminders(
      Timestamp now, int globalLeadMinutes, int limit) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    SQLBuilder query = new SQLBuilder()
        .select(
            YasssCore.getDB().getPrefix() + "volunteer",
            "v.id",
            "v.event",
            "v.name",
            "v.reminder_email",
            "v.reminder_token",
            "e.short_description",
            "w.begin_time")
        .tableAlias("v")
        .join(
            Join.INNER,
            YasssCore.getDB().getPrefix() + "event",
            "e",
            new Comparison("v.event", "e.id", ComparisonOp.EQUAL_TO))
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
        .join( // anti-join: already claimed for this window
            Join.LEFT,
            YasssCore.getDB().getPrefix() + "reminder_log",
            "l",
            new Comparison("v.id", "l.volunteer", ComparisonOp.EQUAL_TO))
        .join( // anti-join: address suppressed platform-wide
            Join.LEFT,
            YasssCore.getDB().getPrefix() + "reminder_suppression",
            "s",
            new Comparison("v.reminder_email", "s.email", ComparisonOp.EQUAL_TO))
        .where("v.reminders_enabled", ComparisonOp.EQUAL_TO)              // bind 1
        .where("v.reminder_state", ComparisonOp.EQUAL_TO)                 // bind 2
        .where("e.published", ComparisonOp.EQUAL_TO)                      // bind 3
        .where("w.begin_time", ComparisonOp.GREATER_THAN)                 // bind 4
        // The horizon is per row, not per sweep: an event may override the
        // global lead time, and COALESCE picks the global for those that do
        // not. Computing it in SQL rather than filtering afterwards keeps
        // `limit` meaningful -- a Java-side filter would let a batch fill with
        // rows that are not due yet and starve ones that are.
        .where(
            "w.begin_time",
            ComparisonOp.LESS_THAN_OR_EQUAL_TO,
            "DATE_ADD(?, INTERVAL COALESCE(e.reminder_lead_time, ?) MINUTE)") // binds 5, 6
        .where("l.volunteer", ComparisonOp.IS_NULL)                       // no bind
        .where("s.email", ComparisonOp.IS_NULL)                           // no bind
        .order("w.begin_time", Order.ASC)
        .limit(limit);

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(query.toString());

      // IS_NULL emits no placeholder and so consumes no index; the six binds
      // are the value-bearing where clauses, in the order written above -- note
      // the horizon expression contributes two of them.
      // Getting this wrong is what silently broke Event.countVolunteers.
      int idx = 0;
      stmt.setBoolean(++idx, true);
      stmt.setInt(++idx, ReminderState.CONFIRMED.ordinal());
      stmt.setBoolean(++idx, true);
      stmt.setTimestamp(++idx, now);
      stmt.setTimestamp(++idx, now);
      stmt.setInt(++idx, globalLeadMinutes);

      res = stmt.executeQuery();

      List<PendingReminder> pending = new ArrayList<>();
      while(res.next())
        pending.add(
            new PendingReminder(
                SQLBuilder.bytesToUUID(res.getBytes("v.id")),
                SQLBuilder.bytesToUUID(res.getBytes("v.event")),
                res.getString("v.name"),
                res.getString("v.reminder_email"),
                SQLBuilder.bytesToUUID(res.getBytes("v.reminder_token")),
                res.getString("e.short_description"),
                res.getTimestamp("w.begin_time")));

      return pending;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }
}
