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
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

  /**
   * Signals that a seat could not be claimed because the slot or its activity
   * was already full.
   *
   * <p>Unchecked so that it can travel out of a
   * {@link com.axonibyte.lib.db.Database.TransactionalWork} lambda, which may
   * only declare {@link SQLException}. The library rolls the transaction back
   * on any exception and rethrows, so the claim is atomic either way.
   */
  public static final class CapacityException extends RuntimeException {

    private final UUID activity;
    private final UUID window;

    private CapacityException(UUID activity, UUID window) {
      super(String.format("slot %s/%s is full", activity, window));
      this.activity = activity;
      this.window = window;
    }

    /** @return the {@link UUID} of the {@link Activity} that was full */
    public UUID getActivity() {
      return activity;
    }

    /** @return the {@link UUID} of the {@link Window} that was full */
    public UUID getWindow() {
      return window;
    }
  }

  /**
   * Atomically claims a single seat.
   *
   * @param activity the {@link UUID} of the {@link Activity}
   * @param window the {@link UUID} of the {@link Window}
   * @param volunteer the {@link UUID} of the {@link Volunteer}
   * @throws CapacityException if the slot or its activity is full
   * @throws SQLException if a database malfunction occurs
   */
  public static void claim(UUID activity, UUID window, UUID volunteer) throws SQLException {
    claimAll(List.of(new RSVP(activity, window, volunteer)));
  }

  /**
   * Atomically claims several seats, all or none.
   *
   * <p><b>Why this exists.</b> Capacity used to be checked by counting on one
   * pooled connection and then inserting on another, with nothing in between.
   * Two claimants for the last seat both read the same count, both passed the
   * guard, and both inserted -- and the endpoint the signup form actually uses
   * did not check at all. Neither is fixable without holding something across
   * the read and the write, and no constraint MariaDB can express says "at most
   * N rows per (activity, window)".
   *
   * <p><b>Why the activity row.</b> A cap exists at two levels: per slot and
   * across the whole activity. Locking the slot would let two claimants on
   * different windows of the same activity proceed in parallel and both pass an
   * activity-wide cap of one. The activity row is the coarsest thing both caps
   * are a function of, and {@code activity} is keyed by its primary key, so
   * this is a single record lock with no gap: contention is exactly per
   * activity, which is the granularity of the invariant.
   *
   * <p><b>Why the lock comes first.</b> InnoDB establishes a transaction's read
   * view at its first <em>consistent</em> read. {@code FOR UPDATE} is a locking
   * read and establishes none, so a plain {@code COUNT(*)} issued after the
   * lock has been granted sees whatever a competitor committed before releasing
   * it. Were the count taken first, it would be answered from a snapshot older
   * than the lock and the whole arrangement would be decorative. The isolation
   * level is pinned for the same reason rather than inherited from the pool.
   *
   * <p><b>Why the ordering.</b> Activities are locked in {@link UUID} order,
   * not in the order the caller listed them. Two requests naming the same two
   * activities in opposite orders would otherwise form a cycle, and InnoDB
   * would resolve it by killing one with a deadlock error that surfaces to the
   * volunteer as a 500.
   *
   * @param slots the {@link Slot}s to claim a seat in
   * @param volunteer the {@link UUID} of the {@link Volunteer}
   * @throws CapacityException if any slot or activity is full; nothing is
   *         written in that case
   * @throws SQLException if a database malfunction occurs
   */
  public static void claim(Collection<Slot> slots, UUID volunteer) throws SQLException {
    final List<RSVP> wanted = new ArrayList<>();
    for(var slot : slots)
      wanted.add(new RSVP(slot.getActivity(), slot.getWindow(), volunteer));
    claimAll(wanted);
  }

  /** The claim itself, once the caller's arguments are in one shape. */
  private static void claimAll(List<RSVP> wanted) throws SQLException {
    if(wanted.isEmpty()) return;
    YasssCore.getDB().transaction(con -> {
      con.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
      claimWithin(con, wanted);
      return null;
    });
  }

  /**
   * Claims seats inside a transaction the caller is already running.
   *
   * <p>For the signup path, which has to count a volunteer's existing signups,
   * insert the volunteer and claim their seats without anything slipping in
   * between — so all of it shares one connection rather than each step opening
   * its own.
   *
   * <p>The caller is responsible for the isolation level and for taking any
   * lock that has to precede these. Locks here are acquired on activity rows in
   * id order; anything the caller locks first (the event row, in the signup
   * case) has to stay first everywhere, or the two orders form a cycle.
   *
   * @param con the {@link Connection} running the transaction
   * @param slots the {@link Slot}s to claim a seat in
   * @param volunteer the {@link UUID} of the {@link Volunteer}
   * @throws CapacityException if any slot or activity is full
   * @throws SQLException if a database malfunction occurs
   */
  public static void claimWithin(Connection con, Collection<Slot> slots, UUID volunteer)
      throws SQLException {
    final List<RSVP> wanted = new ArrayList<>();
    for(var slot : slots)
      wanted.add(new RSVP(slot.getActivity(), slot.getWindow(), volunteer));
    claimWithin(con, wanted);
  }

  private static void claimWithin(Connection con, List<RSVP> wanted) throws SQLException {
    if(wanted.isEmpty()) return;

    final String prefix = YasssCore.getDB().getPrefix();

    List<UUID> activities = wanted.stream()
        .map(RSVP::getActivity)
        .distinct()
        .sorted(Comparator.comparing(UUID::toString))
        .toList();

    Map<UUID, Integer> activityCaps = new LinkedHashMap<>();
    for(var activity : activities)
      activityCaps.put(activity, lockActivity(con, prefix, activity));

    for(var rsvp : wanted) {
      // Read rather than trusted from the caller's in-memory Slot: a concurrent
      // SetSlotEndpoint could otherwise be raced, and a cap read before the lock
      // was taken is a cap that may already be stale.
      int slotCap = slotCap(con, prefix, rsvp.getActivity(), rsvp.getWindow());
      if(0 != slotCap && slotCap <= countSlot(con, prefix, rsvp.getActivity(), rsvp.getWindow()))
        throw new CapacityException(rsvp.getActivity(), rsvp.getWindow());

      int activityCap = activityCaps.get(rsvp.getActivity());
      if(0 != activityCap && activityCap <= countActivity(con, prefix, rsvp.getActivity()))
        throw new CapacityException(rsvp.getActivity(), rsvp.getWindow());

      // Counted again on the next iteration, deliberately: a transaction sees
      // its own uncommitted inserts, so a request claiming two windows of a
      // two-seat activity is counted correctly rather than twice against the
      // same starting number.
      insert(con, prefix, rsvp);
    }
  }

  /**
   * Takes the activity's row lock and returns its cap in the same statement.
   *
   * @return the activity's volunteer cap, {@code 0} meaning unlimited
   * @throws CapacityException if the activity no longer exists
   */
  private static int lockActivity(Connection con, String prefix, UUID activity)
      throws SQLException {
    try(PreparedStatement stmt = con.prepareStatement(
        "SELECT max_activity_volunteers FROM " + prefix + "activity WHERE id = ? FOR UPDATE")) {
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
      try(ResultSet res = stmt.executeQuery()) {
        // Deleted out from under the request. The 404 was already answered
        // upstream, so treating it as "no room" is both true and simpler than
        // a second error path.
        if(!res.next()) throw new CapacityException(activity, null);
        return res.getInt(1);
      }
    }
  }

  private static int slotCap(Connection con, String prefix, UUID activity, UUID window)
      throws SQLException {
    try(PreparedStatement stmt = con.prepareStatement(
        "SELECT max_slot_volunteers FROM " + prefix
            + "slot WHERE activity = ? AND event_window = ?")) {
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(window));
      try(ResultSet res = stmt.executeQuery()) {
        if(!res.next()) throw new CapacityException(activity, window);
        return res.getInt(1);
      }
    }
  }

  private static int countSlot(Connection con, String prefix, UUID activity, UUID window)
      throws SQLException {
    try(PreparedStatement stmt = con.prepareStatement(
        "SELECT COUNT(1) FROM " + prefix + "rsvp WHERE activity = ? AND event_window = ?")) {
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(window));
      try(ResultSet res = stmt.executeQuery()) {
        return res.next() ? res.getInt(1) : 0;
      }
    }
  }

  private static int countActivity(Connection con, String prefix, UUID activity)
      throws SQLException {
    try(PreparedStatement stmt = con.prepareStatement(
        "SELECT COUNT(1) FROM " + prefix + "rsvp WHERE activity = ?")) {
      stmt.setBytes(1, SQLBuilder.uuidToBytes(activity));
      try(ResultSet res = stmt.executeQuery()) {
        return res.next() ? res.getInt(1) : 0;
      }
    }
  }

  /** The same insert {@link #commit()} performs, on the caller's connection. */
  private static void insert(Connection con, String prefix, RSVP rsvp) throws SQLException {
    try(PreparedStatement stmt = con.prepareStatement(
        new SQLBuilder()
            .insertIgnore(prefix + "rsvp", "activity", "event_window", "volunteer")
            .toString())) {
      stmt.setBytes(1, SQLBuilder.uuidToBytes(rsvp.getActivity()));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(rsvp.getWindow()));
      stmt.setBytes(3, SQLBuilder.uuidToBytes(rsvp.volunteer));
      stmt.executeUpdate();
    }
  }

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
                  "ip_addr_bin")
              .where("id")
              .limit(1)
              .wrap(new Wrapper(5, "INET6_NTOA"))
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
            res.getString("ip_addr_bin"));
      
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
      
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
  
}
