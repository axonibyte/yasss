/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.Volunteer;
import com.crowdease.yasss.model.Volunteer.ReminderState;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Confirms or cancels a volunteer's reminder subscription.
 *
 * <p>Both halves are reached from a link in an email, so both are deliberately
 * forgiving: they always answer 200 with the same message whatever the token
 * turns out to be. Telling an unauthenticated caller whether a token was valid
 * would let anyone with a volunteer id probe for live subscriptions.
 *
 * <p>The token is matched in the {@code WHERE} clause rather than compared in
 * Java, so there is no branch to get wrong and no early return to leak timing.
 *
 * @author Caleb L. Power
 */
public final class ReminderSubscriptionEndpoint extends APIEndpoint {

  /** Whether this instance confirms a subscription or cancels one. */
  public static enum Mode { CONFIRM, UNSUBSCRIBE }

  private final Mode mode;

  /**
   * Instantiates the endpoint.
   *
   * @param mode whether to confirm or unsubscribe
   */
  public ReminderSubscriptionEndpoint(Mode mode) {
    super(
        "/events/:event/volunteers/:volunteer/reminders",
        APIVersion.VERSION_1,
        Mode.CONFIRM == mode ? HTTPMethod.PUT : HTTPMethod.DELETE);
    this.mode = mode;
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth)
      throws EndpointException {
    try {
      final String token;
      if(Mode.CONFIRM == mode) {
        JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("token", true)
          .check();
        token = deserializer.getString("token");
      } else {
        // Unsubscribe is a one-click link from an email client, so the token
        // rides in the query string rather than a body.
        token = req.queryParams("token");
      }

      UUID eventID;
      UUID volunteerID;
      UUID tokenID;
      try {
        eventID = UUID.fromString(req.params("event"));
        volunteerID = UUID.fromString(req.params("volunteer"));
        tokenID = UUID.fromString(token);
      } catch(IllegalArgumentException | NullPointerException e) {
        // Indistinguishable from a wrong token, on purpose.
        return acknowledge(res);
      }

      Event event = Event.getEvent(eventID);
      Volunteer volunteer = null == event ? null : event.getVolunteer(volunteerID);

      if(null != volunteer
          && null != volunteer.getReminderToken()
          && volunteer.getReminderToken().equals(tokenID)) {

        if(Mode.CONFIRM == mode) {
          // A recipient who already asked to stop does not get resubscribed by
          // replaying an older confirmation link.
          if(ReminderState.UNSUBSCRIBED != volunteer.getReminderState()) {
            volunteer.setReminderState(ReminderState.CONFIRMED).commit();

            // Clicking a link in mail sent to that address proves control of it
            // and is explicit consent, so it lifts an earlier platform-wide
            // suppression. Without this, anyone who ever unsubscribed would be
            // permanently unable to opt back in and nothing would say why -- the
            // finder anti-joins the suppression table, so their reminders would
            // simply never arrive.
            unsuppress(volunteer.getReminderEmail());
          }
        } else {
          volunteer
              .setReminderState(ReminderState.UNSUBSCRIBED)
              .enableReminders(false)
              .commit();
          suppress(volunteer.getReminderEmail());
        }
      }

      return acknowledge(res);

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }

  /** The single response this endpoint ever gives. */
  private JSONObject acknowledge(Response res) {
    res.status(200);
    return new JSONObject()
        .put("status", "ok")
        .put(
            "info",
            Mode.CONFIRM == mode
                ? "reminder subscription confirmed"
                : "reminder subscription cancelled");
  }

  /**
   * Suppresses an address platform-wide.
   *
   * <p>Not per volunteer row: someone who signs up for several events and
   * unsubscribes once expects to be done, and per-row-only unsubscribe is how
   * sending domains end up blocklisted.
   */
  private void unsuppress(String email) throws SQLException {
    if(null == email) return;

    Connection con = null;
    PreparedStatement stmt = null;
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "DELETE FROM %1$sreminder_suppression WHERE email = ?",
              YasssCore.getDB().getPrefix()));
      stmt.setString(1, email);
      stmt.executeUpdate();
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  private void suppress(String email) throws SQLException {
    if(null == email) return;

    Connection con = null;
    PreparedStatement stmt = null;
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "INSERT IGNORE INTO %1$sreminder_suppression (email) VALUES (?)",
              YasssCore.getDB().getPrefix()));
      stmt.setString(1, email);
      stmt.executeUpdate();
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
}
