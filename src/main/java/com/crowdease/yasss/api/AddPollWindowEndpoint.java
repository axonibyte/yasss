/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.PollCell;
import com.crowdease.yasss.model.PollOption;
import com.crowdease.yasss.model.PollWindow;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that adds a row to a poll, and applies it to columns.
 *
 * <p>The "apply to" control lives here. Absent means every column, which is the
 * default the organizer sees; a list names the columns to offer it on.
 * {@code appliesToNewOptions} is separate and is not a list at all -- it is the
 * standing rule that catches columns added later, and it is stored on the row
 * rather than expanded now, because a one-time expansion cannot reach forward
 * in time.
 *
 * <p>The repeat control is deliberately absent. "Repeat every ninety minutes"
 * is an authoring convenience that produces several start times, and the client
 * expands it and posts them one at a time; storing the recurrence would mean
 * re-expanding it on every read, in two languages, forever.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class AddPollWindowEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public AddPollWindowEndpoint() {
    super("/polls/:poll/windows", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.editable(req, auth);

      if(CreatePollEndpoint.MAX_WINDOWS <= poll.getWindows().size())
        throw new EndpointException(req, "too many windows", 400);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("startTime", true)
          .tokenize("appliesToNewOptions", false)
          .tokenize("applyTo", false)
          .check();

      PollWindow window = new PollWindow(
          null,
          poll.getID(),
          validTime(req, deserializer.getString("startTime"), "startTime"),
          deserializer.has("appliesToNewOptions")
              && deserializer.getBool("appliesToNewOptions"));

      Set<PollOption> options = poll.getOptions();

      // Absent means all of them, which is what "apply to: all" sends by saying
      // nothing. An empty array is not the same thing and is honored as such:
      // a row offered on no column at all is a legitimate half-built state, and
      // quietly reading it as "all" would be the surprising answer.
      Set<UUID> applyTo = new LinkedHashSet<>();
      if(deserializer.has("applyTo")) {
        Set<UUID> known = new LinkedHashSet<>();
        for(PollOption option : options) known.add(option.getID());

        for(Object raw : deserializer.getJSONArray("applyTo")) {
          UUID optionID;
          try {
            optionID = UUID.fromString(String.valueOf(raw));
          } catch(IllegalArgumentException e) {
            throw new EndpointException(req, "malformed argument (applyTo[])", 400);
          }
          if(!known.contains(optionID))
            throw new EndpointException(req, "option not found", 404);
          applyTo.add(optionID);
        }
      } else {
        for(PollOption option : options) applyTo.add(option.getID());
      }

      try {
        YasssCore.getDB().transaction(con -> {
          window.commit(con);
          for(UUID optionID : applyTo)
            new PollCell(null, optionID, window.getID()).commit(con);
          return null;
        });
      } catch(SQLException e) {
        // The unique index on (poll, start_time), rather than a read followed
        // by a write. Two rows at one time are indistinguishable to a
        // respondent and would split their vote between them.
        if(1062 == e.getErrorCode())
          throw new EndpointException(req, "that time is already on this poll", 409, e);
        throw e;
      }

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created window")
          .put("window", PollView.window(window));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
