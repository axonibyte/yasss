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

/**
 * Models an activity in an event. Intended to represent a task that a volunteer
 * wishes to partake in.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class Activity implements Comparable<Activity> {
  
  private UUID id = null;
  private UUID event = null;
  private String shortDescription = null;
  private String longDescription = null;
  private int maxActivityVolunteers = -1;
  private int maxSlotVolunteersDefault = -1;
  private int priority = 0;

  /**
   * Instantiates an {@link Activity}.
   *
   * @param id the {@link UUID} associated with this activity
   * @param event the {@link UUID} associated with the event containing this
   *        activity
   * @param shortDescription the activity's primary label
   * @param longDescription additional information associated with this activity
   * @param maxActivityVolunteers the maximum number of volunteers that are
   *        permitted to sign up for this activity, or {@code 0} if an unlimited
   *        number of volunteers are allowed to sign up; must be non-negative
   * @param maxSlotVolunteersDefault the default maximum number of volunteers
   *        that are permitted to sign up for slots associated with this activity,
   *        or {@code null} if an unlimited number of volunteers are allowed to
   *        sign up by default; must be non-negative
   * @param priority the ascending-order display rank of the window
   */
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

  /**
   * Retrieves the unique ID associated with this {@link Activity}.
   *
   * @return the {@link UUID} associated with the {@link Activity}
   */
  public UUID getID() {
    return id;
  }

  /**
   * Retrieves the unique ID of the {@link Event} associated with this activity.
   *
   * @return the {@link UUID} of the {@link Event}
   */
  public UUID getEvent() {
    return event;
  }

  /**
   * Sets the unique ID of the {@link Event} associated with this activity.
   *
   * @param event the {@link UUID} of the {@link Event}
   * @return this {@link Activity} instance
   */
  public Activity setEvent(UUID event) {
    this.event = event;
    return this;
  }

  /**
   * Retrieves the activity's primary label.
   *
   * @return the short description associated with this {@link Activity}
   */
  public String getShortDescription() {
    return shortDescription;
  }

  /**
   * Sets the activity's primary label.
   *
   * @param shortDescription the short description associated with this {@link Activity}
   * @return this {@link Activity} instance
   */
  public Activity setShortDescription(String shortDescription) {
    this.shortDescription = shortDescription;
    return this;
  }

  /**
   * Retrieves additional information associated with this activity.
   *
   * @return the long description associated with this {@link Activity}
   */
  public String getLongDescription() {
    return longDescription;
  }

  /**
   * Sets the note (long description) for this activity.
   *
   * @param longDescription the long description associated with this {@link Activity}
   * @return this {@link Activity} instance
   */
  public Activity setLongDescription(String longDescription) {
    this.longDescription = longDescription;
    return this;
  }

  /**
   * Retrieves the maximum number of volunteers that are permitted to sign up for
   * this activity.
   *
   * @return a positive integer indicating the finite volunteer cap or {@code 0}
   *         if there is no volunteer cap
   */
  public int getMaxActivityVolunteers() {
    return maxActivityVolunteers;
  }

  /**
   * Sets the maximum number of volunteers that are permitted to sign up for this
   * activity.
   *
   * @param maxVolunteers a positive integer indicating the finite volunteer cap
   *        or {@code null} if there should be no cap
   * @return this {@link Activity} instance
   */
  public Activity setMaxActivityVolunteers(int maxVolunteers) {
    this.maxActivityVolunteers = maxVolunteers;
    return this;
  }

  /**
   * Retrieves the default maximum number of volunteers that are permitted to sign
   * up for individual slots associated with this activity.
   *
   * @return a positive integer indicating the finite volunteer cap or {@code 0}
   *         if there is not volunteer cap
   */
  public int getMaxSlotVolunteersDefault() {
    return maxSlotVolunteersDefault;
  }

  /**
   * Sets the default maximum number of volunteers that are permitted to sign up
   * for individual slots associated with this activity.
   *
   * @param maxVolunteers a positive integer indicating the default finite
   *        volunteer cap or {@code null} if there should be no default cap
   * @return this {@link Activity} instance
   */
  public Activity setMaxSlotVolunteersDefault(int maxVolunteers) {
    this.maxSlotVolunteersDefault = maxVolunteers;
    return this;
  }

  /**
   * Retrieves the priority associated with the activity--that is, a number
   * associated with the ascending order in which activities are retrieved.
   *
   * @return the priority
   */
  public int getPriority() {
    return priority;
  }

  /**
   * Sets the activity's priority.
   *
   * @param some number between {@code 0} and {@code 255} (inclusive)
   */
  public Activity setPriority(int priority) {
    this.priority = priority;
    return this;
  }

  /**
   * Retrieves all slots associated with this activity.
   *
   * @return a {@link Set} of {@link Slot} objects
   */
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
                    res.getBytes("s.event_window")),
                res.getInt("s.max_slot_volunteers")));
      return slots;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Retrieves a specific {@link Slot} associated with this {@link Activity}.
   *
   * @param windowID the {@link UUID} associated with the {@link Window} with
   *        which this {@link Activity} forms an intersection manifesting as
   *        the desired {@link Slot}
   * @return the {@link Slot} that forms the intersection of this {@link Activity}
   *         and the provided {@link Window} {@link UUID}, if it exists;
   *         otherwise, {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public Slot getSlot(UUID windowID) throws SQLException {
    if(null == windowID) return null;
    
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
              .where("event_window")
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

  /**
   * Counts the total number of RSVPS across all slots associated with this
   * {@link Activity}.
   *
   * @return this activity's total number of RSVPS
   */
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

  /**
   * Saves this {@link Activity} to the database. If it already exists, it is
   * merely updated.
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

  /**
   * Removes this {@link Activity} from the database.
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

  /**
   * {@inheritDoc}
   */
  @Override public int compareTo(Activity activity) {
    Objects.requireNonNull(activity);
    int c;
    return 0 == (c = Integer.compare(priority, activity.priority))
        ? shortDescription.compareToIgnoreCase(activity.shortDescription)
        : c;
  }
  
}
