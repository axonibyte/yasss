/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
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

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that changes a column of a poll, including its "All Day" setting.
 *
 * <p>There is deliberately no separate route for the all-day square. The
 * option's flag is the authority and this endpoint owns both sides of it, which
 * removes the only way the flag and the square could come to disagree.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class ModifyPollOptionEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ModifyPollOptionEndpoint() {
    super("/polls/:poll/options/:option", APIVersion.VERSION_1, HTTPMethod.PATCH);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.editable(req, auth);

      PollOption option = null;
      try {
        option = poll.getOption(UUID.fromString(req.params("option")));
      } catch(IllegalArgumentException e) { }

      if(null == option)
        throw new EndpointException(req, "option not found", 404);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("dayOfWeek", false)
          .tokenize("date", false)
          .tokenize("allDay", false)
          .tokenize("priority", false)
          .check();

      if(deserializer.has("dayOfWeek")) {
        if(Poll.Scope.RELATIVE != poll.getScope())
          throw new EndpointException(req, "unexpected argument (dayOfWeek)", 400);
        int day = deserializer.getInt("dayOfWeek");
        if(1 > day || 7 < day)
          throw new EndpointException(req, "malformed argument (dayOfWeek)", 400);
        option.setDayOfWeek(day);
      }

      if(deserializer.has("date")) {
        if(Poll.Scope.ABSOLUTE != poll.getScope())
          throw new EndpointException(req, "unexpected argument (date)", 400);
        option.setDate(validDate(req, deserializer.getString("date"), "date"));
      }

      if(deserializer.has("priority")) {
        option.setPriority(deserializer.getInt("priority"));
        if(0 > option.getPriority() || 255 < option.getPriority())
          throw new EndpointException(req, "malformed argument (int: priority)", 400);
      }

      final boolean allDay = deserializer.has("allDay")
          ? deserializer.getBool("allDay")
          : option.isAllDay();
      final boolean wasAllDay = option.isAllDay();
      option.setAllDay(allDay);

      final PollOption target = option;
      try {
        YasssCore.getDB().transaction(con -> {
          target.commit(con);

          // Non-destructive in both directions. Turning All Day on adds the
          // whole-day square and leaves every timed square exactly where it is,
          // so turning it off again restores the column the organiser built
          // rather than making them build it a second time. The timed squares
          // simply stop being offered while the flag is set, which is a
          // rendering and voting rule rather than a deletion.
          if(allDay && !wasAllDay)
            new PollCell(null, target.getID(), null).commit(con);
          else if(!allDay && wasAllDay) {
            PollCell allDayCell = PollCell.getCell(target.getID(), null);
            if(null != allDayCell) allDayCell.delete();
          }

          return null;
        });
      } catch(SQLException e) {
        if(1062 == e.getErrorCode())
          throw new EndpointException(req, "that day is already on this poll", 409, e);
        throw e;
      }

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated option")
          .put("option", PollView.option(option));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
