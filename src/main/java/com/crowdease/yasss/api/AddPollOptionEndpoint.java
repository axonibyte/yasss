/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;

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
 * Endpoint that adds a column to a poll.
 *
 * <p>This is where "apply to future days/dates" is honored. A window carrying
 * that flag reaches forward in time to columns that did not exist when it was
 * written, and this is the moment that happens -- which is why the flag is
 * stored as a standing rule rather than expanded once when the organizer set it.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class AddPollOptionEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public AddPollOptionEndpoint() {
    super("/polls/:poll/options", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.editable(req, auth);

      if(CreatePollEndpoint.MAX_OPTIONS <= poll.getOptions().size())
        throw new EndpointException(req, "too many options", 400);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("dayOfWeek", false)
          .tokenize("date", false)
          .tokenize("allDay", false)
          .tokenize("priority", false)
          .check();

      PollOption option = new PollOption(
          null,
          poll.getID(),
          null,
          null,
          deserializer.has("allDay") && deserializer.getBool("allDay"),
          deserializer.has("priority")
              ? deserializer.getInt("priority")
              : poll.getOptions().size());

      if(Poll.Scope.RELATIVE == poll.getScope()) {
        if(!deserializer.has("dayOfWeek"))
          throw new EndpointException(req, "malformed argument (dayOfWeek)", 400);
        int day = deserializer.getInt("dayOfWeek");
        if(1 > day || 7 < day)
          throw new EndpointException(req, "malformed argument (dayOfWeek)", 400);
        option.setDayOfWeek(day);
      } else {
        if(!deserializer.has("date"))
          throw new EndpointException(req, "malformed argument (date)", 400);
        option.setDate(validDate(req, deserializer.getString("date"), "date"));
      }

      if(0 > option.getPriority() || 255 < option.getPriority())
        throw new EndpointException(req, "malformed argument (int: priority)", 400);

      // The duplicate is caught by the unique index rather than a read-then-write.
      // Two organizers adding Tuesday at once would both find it absent and both
      // insert, which is the check-then-act shape this codebase has spent two
      // rounds removing.
      try {
        YasssCore.getDB().transaction(con -> {
          option.commit(con);

          for(PollWindow window : poll.getWindows()) {
            if(!window.appliesToNewOptions()) continue;
            new PollCell(null, option.getID(), window.getID()).commit(con);
          }
          if(option.isAllDay())
            new PollCell(null, option.getID(), null).commit(con);

          return null;
        });
      } catch(SQLException e) {
        if(1062 == e.getErrorCode())
          throw new EndpointException(req, "that day is already on this poll", 409, e);
        throw e;
      }

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created option")
          .put("option", PollView.option(option));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
