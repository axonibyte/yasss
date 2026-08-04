/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.daemon;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.HTMLElem;
import com.crowdease.yasss.model.Mail;
import com.crowdease.yasss.model.Volunteer;
import com.crowdease.yasss.model.Volunteer.PendingReminder;
import com.crowdease.yasss.model.VolunteerSummary;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Sends volunteers a reminder before their event begins.
 *
 * <p>Modelled on {@link TicketEngine} for thread lifecycle, with three
 * deliberate differences, each earned:
 *
 * <ul>
 *   <li>the sweep catches {@link SQLException} <em>inside</em> the loop. A
 *       reminder daemon that dies on one transient database blip and then
 *       silently sends nothing forever is the worst failure this feature has;
 *   <li>the thread is named, because there are now two daemons and an
 *       unnamed {@code Thread-N} in a stack dump is not diagnosable;
 *   <li>each send is wrapped individually, so one malformed address cannot
 *       abort a batch of two hundred.
 * </ul>
 *
 * <p>Claims are taken <em>before</em> sending, not after. At-most-once is the
 * right bias for email: a duplicate reminder is worse than a missed one, and
 * the poll loop has no retry semantics to make at-least-once meaningful.
 *
 * @author Caleb L. Power
 */
public class ReminderEngine implements Runnable {

  private static final Logger logger = LoggerFactory.getLogger(ReminderEngine.class);

  private final int pollInterval;
  private final int leadTime;
  private final int batchSize;
  private final boolean mailEnabled;

  private Thread thread = null;

  /**
   * Instantiates the reminder engine.
   *
   * @param pollInterval minutes between sweeps
   * @param leadTime minutes before an event begins to send its reminder
   * @param batchSize the most reminders to send in one sweep
   * @param mailEnabled whether a mailer was actually configured
   * @throws IllegalArgumentException if any interval is not positive
   */
  public ReminderEngine(int pollInterval, int leadTime, int batchSize, boolean mailEnabled) {
    if(1 > pollInterval)
      throw new IllegalArgumentException("poll interval must be at least 1 minute");
    if(1 > leadTime)
      throw new IllegalArgumentException("lead time must be at least 1 minute");
    if(1 > batchSize)
      throw new IllegalArgumentException("batch size must be at least 1");

    this.pollInterval = pollInterval;
    this.leadTime = leadTime;
    this.batchSize = batchSize;
    this.mailEnabled = mailEnabled;
  }

  /** Starts the daemon, if it is not already running. */
  public void start() {
    if(null == thread) {
      thread = new Thread(this);
      thread.setName("reminder-engine");
      thread.setDaemon(true);
      thread.start();
    }
  }

  /** Stops the daemon, if it is running. */
  public void stop() {
    if(null != thread) thread.interrupt();
  }

  /**
   * {@inheritDoc}
   */
  @Override public void run() {
    logger.info("reminder engine started");

    try {
      while(!thread.isInterrupted()) {
        try {
          sweep();
        } catch(SQLException e) {
          // Deliberately swallowed: one bad poll must not end the daemon.
          logger.error(
              "reminder sweep failed, will retry: {}",
              null == e.getMessage() ? "no further info available" : e.getMessage());
        }
        Thread.sleep((long)pollInterval * 60_000L);
      }
    } catch(InterruptedException e) { }

    logger.warn("reminder engine stopped");
    thread = null;
  }

  /**
   * Finds and sends the reminders currently due.
   *
   * @throws SQLException if a database malfunction occurs
   */
  void sweep() throws SQLException {
    // Checked up front, and this is not merely log hygiene. Mail.send() no-ops
    // with a warning when no mailer was configured, so a naive loop would
    // commit a claim row for every reminder it "sent" -- permanently marking
    // the entire backlog as delivered. A misconfigured SMTP block would burn
    // every pending reminder silently.
    if(!mailEnabled) return;

    long now = System.currentTimeMillis();
    // The lead time goes to the finder rather than a computed horizon, because
    // an event may override it and the bound is therefore per row.
    var pending = Volunteer.getPendingReminders(
        new Timestamp(now), leadTime, batchSize);

    if(pending.isEmpty()) return;
    logger.info("reminder sweep found {} due", pending.size());

    // Events are commonly shared across many volunteers in one sweep.
    Map<UUID, Event> events = new HashMap<>();

    for(PendingReminder due : pending) {
      if(!claim(due)) continue;

      try {
        Event event = events.computeIfAbsent(due.eventID(), id -> {
          try {
            return Event.getEvent(id);
          } catch(SQLException e) {
            return null;
          }
        });
        if(null == event) continue;

        send(event, due);
        markDelivered(due);

      } catch(Exception e) {
        // One bad address must not abort the batch. The claim stays, so this
        // reminder is not retried -- see the at-most-once note above.
        logger.error(
            "could not send a reminder to volunteer {}: {}",
            due.volunteerID(),
            null == e.getMessage() ? e.getClass().getSimpleName() : e.getMessage());
      }
    }
  }

  /**
   * Attempts to claim a reminder for sending.
   *
   * <p>The ledger's composite primary key is what makes this safe: only the
   * caller whose insert affects a row may send, so two instances polling
   * simultaneously, or one restarted mid-sweep, cannot double-send.
   *
   * @param due the reminder to claim
   * @return {@code true} if this caller won the claim
   */
  private boolean claim(PendingReminder due) {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "INSERT IGNORE INTO %1$sreminder_log (volunteer, window_begin) VALUES (?, ?)",
              YasssCore.getDB().getPrefix()));
      stmt.setBytes(1, SQLBuilder.uuidToBytes(due.volunteerID()));
      stmt.setTimestamp(2, due.windowBegin());

      boolean won = 0 != stmt.executeUpdate();
      if(!won) {
        // INSERT IGNORE also downgrades genuine errors to warnings and returns
        // zero, so a truncation or constraint violation is indistinguishable
        // from "somebody else claimed it" unless the warnings are inspected.
        logger.debug(
            "did not claim a reminder for volunteer {}; warnings: {}",
            due.volunteerID(),
            stmt.getWarnings());
      }
      return won;

    } catch(SQLException e) {
      logger.error("could not claim a reminder: {}", e.getMessage());
      return false;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /** Records that a claimed reminder actually went out. Diagnostic only. */
  private void markDelivered(PendingReminder due) {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "UPDATE %1$sreminder_log SET delivered = 1 "
                  + "WHERE volunteer = ? AND window_begin = ?",
              YasssCore.getDB().getPrefix()));
      stmt.setBytes(1, SQLBuilder.uuidToBytes(due.volunteerID()));
      stmt.setTimestamp(2, due.windowBegin());
      stmt.executeUpdate();
    } catch(SQLException e) {
      // Not worth failing the send over; the claim is what prevents duplicates.
      logger.debug("could not mark a reminder delivered: {}", e.getMessage());
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /** Builds and sends one reminder. */
  private void send(Event event, PendingReminder due) throws SQLException {
    Volunteer volunteer = event.getVolunteer(due.volunteerID());

    Map<String, String> args = new HashMap<>();
    // Substituted into an HTML body by Mail, so escaped here.
    args.put("EVENT_TITLE", HTMLElem.escape(due.eventTitle()));
    args.put(
        "EVENT_DATE",
        VolunteerSummary.eventDate(due.windowBegin(), event.getTimezone()));
    args.put("VOLUNTEER_NAME", HTMLElem.escape(due.volunteerName()));
    args.put(
        "RSVP_LIST",
        null == volunteer ? "<ul></ul>" : VolunteerSummary.rsvpList(event, volunteer));
    args.put(
        "EVENT_URL",
        String.format("%1$s/?event=%2$s", YasssCore.getAPIHost(), due.eventID()));
    args.put(
        "UNSUBSCRIBE",
        String.format(
            "%1$s/?action=unsubscribe-reminders&event=%2$s&volunteer=%3$s&token=%4$s",
            YasssCore.getAPIHost(),
            due.eventID(),
            due.volunteerID(),
            due.token()));

    new Mail(due.recipient(), "event-reminder", args).send();
  }
}
