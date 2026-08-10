/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.Date;
import java.sql.SQLException;
import java.sql.Time;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Detail;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.PollCell;
import com.crowdease.yasss.model.PollDetail;
import com.crowdease.yasss.model.PollOption;
import com.crowdease.yasss.model.PollWindow;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles the creation of polls.
 *
 * <p>The whole graph in one request, as {@link CreateEventEndpoint} does: the
 * client builds a poll locally and this is the moment it becomes real. There is
 * no draft state on the server, so creating and publishing are the same act.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public final class CreatePollEndpoint extends APIEndpoint {

  /**
   * The most columns one poll may offer.
   *
   * <p>Thirty-one covers a month of dates, which is past the point where a grid
   * is a useful way to ask anybody anything.
   */
  public static final int MAX_OPTIONS = 31;

  /**
   * The most rows one poll may offer.
   *
   * <p>Ninety-six is every quarter hour in a day. The cap matters because the
   * client offers "repeat every", and "repeat every minute" is fourteen hundred
   * rows and forty-four thousand squares from a single request.
   */
  public static final int MAX_WINDOWS = 96;

  /**
   * Instantiates the endpoint.
   */
  public CreatePollEndpoint() {
    super("/polls", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("admin", false)
          .tokenize("shortDescription", true)
          .tokenize("longDescription", false)
          .tokenize("scope", true)
          .tokenize("timeMode", false)
          .tokenize("timezone", false)
          .tokenize("responseDeadline", false)
          .tokenize("allowMultiAnswers", false)
          .tokenize("allowAnswerEdits", false)
          .tokenize("resultVisibility", false)
          .tokenize("options", true)
          .tokenize("windows", true)
          .tokenize("details", false)
          .tokenize("cells", false)
          .check();

      User user = null;
      if(deserializer.has("admin")) {
        user = User.getUser(deserializer.getUUID("admin"));
        if(null == user)
          throw new EndpointException(req, "user not found", 404);
      }

      // Byte-for-byte the check CreateEventEndpoint makes: anonymous callers
      // need a CAPTCHA, signed-in ones need a verified account, and nobody
      // creates a poll administered by somebody else.
      if(!auth.is(Authorization.IS_AUTHENTICATED) && !auth.atLeast(Authorization.IS_HUMAN)
          || auth.is(Authorization.IS_AUTHENTICATED) && !auth.atLeast(AccessLevel.STANDARD)
          || null != user && !auth.atLeast(user))
        throw new EndpointException(req, "access denied", 403);

      Poll poll = new Poll(
          null,
          deserializer.has("admin") ? deserializer.getUUID("admin") : null,
          bounded(req, deserializer.getString("shortDescription").strip(), "shortDescription"),
          deserializer.has("longDescription")
              ? bounded(req, deserializer.getString("longDescription").strip(), "longDescription")
              : "",
          enumOf(req, Poll.Scope.class, deserializer.getString("scope"), "scope"),
          new Timestamp(System.currentTimeMillis()),
          // No payment gate and no draft state, so a poll is published the
          // moment it exists. The column is kept for parity with `event` and
          // for the day one of those becomes true.
          true);

      if(poll.getShortDescription().isBlank())
        throw new EndpointException(req, "malformed argument (string: shortDescription)", 400);

      if(deserializer.has("timeMode"))
        poll.setTimeMode(
            enumOf(req, Poll.TimeMode.class, deserializer.getString("timeMode"), "timeMode"));
      if(deserializer.has("allowMultiAnswers"))
        poll.allowMultiAnswers(deserializer.getBool("allowMultiAnswers"));
      if(deserializer.has("allowAnswerEdits"))
        poll.allowAnswerEdits(deserializer.getBool("allowAnswerEdits"));
      if(deserializer.has("resultVisibility"))
        poll.setResultVisibility(
            enumOf(
                req,
                Poll.ResultVisibility.class,
                deserializer.getString("resultVisibility"),
                "resultVisibility"));
      if(deserializer.has("responseDeadline"))
        poll.setResponseDeadline(deserializer.getTimestamp("responseDeadline"));
      if(deserializer.has("timezone"))
        poll.setTimezone(validTimezone(req, deserializer.getString("timezone").strip()));

      PollRules.validate(req, poll);

      // --- columns ---------------------------------------------------------

      List<PollOption> options = new ArrayList<>();
      Set<Object> seen = new LinkedHashSet<>();
      for(var optionDeserializer : deserializer.tokenizeJSONArray("options", true)) {
        optionDeserializer
            .tokenize("dayOfWeek", false)
            .tokenize("date", false)
            .tokenize("allDay", false)
            .tokenize("priority", false)
            .check();

        PollOption option = new PollOption(
            null, null, null, null,
            optionDeserializer.has("allDay") && optionDeserializer.getBool("allDay"),
            optionDeserializer.has("priority") ? optionDeserializer.getInt("priority") : options.size());

        // Which field is required is the scope's business, and getting it wrong
        // is a 400 rather than a CHECK violation surfacing as a 500 from the
        // middle of a commit.
        if(Poll.Scope.RELATIVE == poll.getScope()) {
          if(!optionDeserializer.has("dayOfWeek"))
            throw new EndpointException(req, "malformed argument (options[].dayOfWeek)", 400);
          int day = optionDeserializer.getInt("dayOfWeek");
          if(1 > day || 7 < day)
            throw new EndpointException(req, "malformed argument (options[].dayOfWeek)", 400);
          option.setDayOfWeek(day);
          if(!seen.add(Integer.valueOf(day)))
            throw new EndpointException(req, "duplicate argument (options[].dayOfWeek)", 400);
        } else {
          if(!optionDeserializer.has("date"))
            throw new EndpointException(req, "malformed argument (options[].date)", 400);
          Date date = validDate(req, optionDeserializer.getString("date"), "options[].date");
          option.setDate(date);
          if(!seen.add(date.toString()))
            throw new EndpointException(req, "duplicate argument (options[].date)", 400);
        }

        if(0 > option.getPriority() || 255 < option.getPriority())
          throw new EndpointException(req, "malformed argument (int: options[].priority)", 400);

        options.add(option);
      }

      if(options.isEmpty())
        throw new EndpointException(req, "malformed argument (options)", 400);
      if(MAX_OPTIONS < options.size())
        throw new EndpointException(req, "too many options", 400);

      // --- rows ------------------------------------------------------------

      List<PollWindow> windows = new ArrayList<>();
      Set<String> times = new LinkedHashSet<>();
      for(var windowDeserializer : deserializer.tokenizeJSONArray("windows", true)) {
        windowDeserializer
            .tokenize("startTime", true)
            .tokenize("appliesToNewOptions", false)
            .check();

        Time startTime = validTime(req, windowDeserializer.getString("startTime"), "windows[].startTime");
        // Deduplicated here rather than left to the unique index. Two rows at
        // one time are indistinguishable to a respondent and would split their
        // vote, and catching it as a 1062 out of a batch means telling the
        // caller which of their windows collided is no longer possible.
        if(!times.add(startTime.toString()))
          throw new EndpointException(req, "duplicate argument (windows[].startTime)", 400);

        windows.add(
            new PollWindow(
                null,
                null,
                startTime,
                windowDeserializer.has("appliesToNewOptions")
                    && windowDeserializer.getBool("appliesToNewOptions")));
      }

      if(windows.isEmpty())
        throw new EndpointException(req, "malformed argument (windows)", 400);
      if(MAX_WINDOWS < windows.size())
        throw new EndpointException(req, "too many windows", 400);

      // --- questions -------------------------------------------------------

      List<PollDetail> details = new ArrayList<>();
      if(deserializer.has("details"))
        for(var detailDeserializer : deserializer.tokenizeJSONArray("details", true)) {
          detailDeserializer
              .tokenize("type", true)
              .tokenize("label", true)
              .tokenize("hint", false)
              .tokenize("priority", false)
              .tokenize("required", false)
              .check();

          PollDetail detail = new PollDetail(
              null,
              null,
              enumOf(req, Detail.Type.class, detailDeserializer.getString("type"), "details[].type"),
              bounded(req, detailDeserializer.getString("label").strip(), "details[].label"),
              detailDeserializer.has("hint")
                  ? bounded(req, detailDeserializer.getString("hint").strip(), "details[].hint")
                  : "",
              detailDeserializer.has("priority")
                  ? detailDeserializer.getInt("priority")
                  : details.size(),
              detailDeserializer.has("required") && detailDeserializer.getBool("required"));

          if(detail.getLabel().isBlank())
            throw new EndpointException(req, "malformed argument (string: details[].label)", 400);
          if(0 > detail.getPriority() || 255 < detail.getPriority())
            throw new EndpointException(req, "malformed argument (int: details[].priority)", 400);

          details.add(detail);
        }

      // --- squares ---------------------------------------------------------
      //
      // PRESENCE ENABLES, which is the opposite of the event payload's rule for
      // slots -- there, omitting a slot enables it, and one entry per pair is
      // emitted precisely so that nothing is decided by omission. Here a square
      // exists if and only if it is listed. Anybody who has read one of these
      // and then the other will assume the wrong one.
      //
      // Columns and rows are named by their index in the arrays above, because
      // nothing has an id yet.
      List<int[]> cells = new ArrayList<>();
      if(deserializer.has("cells"))
        for(var cellDeserializer : deserializer.tokenizeJSONArray("cells", true)) {
          cellDeserializer
              .tokenize("option", true)
              .tokenize("window", false)
              .check();

          int optionIdx = cellDeserializer.getInt("option");
          if(0 > optionIdx || options.size() <= optionIdx)
            throw new EndpointException(req, "malformed argument (int: cells[].option)", 400);

          // Absent means the all-day square, which is the same thing a null
          // poll_window column means in the database.
          int windowIdx = -1;
          if(cellDeserializer.has("window")) {
            windowIdx = cellDeserializer.getInt("window");
            if(0 > windowIdx || windows.size() <= windowIdx)
              throw new EndpointException(req, "malformed argument (int: cells[].window)", 400);
          }

          cells.add(new int[] { optionIdx, windowIdx });
        }

      // --- write -----------------------------------------------------------
      //
      // One transaction. A poll whose columns landed and whose squares did not
      // is a grid where nothing can be voted for, and it would be published.
      YasssCore.getDB().transaction(con -> {
        poll.commit(con);

        for(PollOption option : options) {
          option.setPoll(poll.getID());
          option.commit(con);
        }
        for(PollWindow window : windows) {
          window.setPoll(poll.getID());
          window.commit(con);
        }
        for(PollDetail detail : details) {
          detail.setPoll(poll.getID());
          detail.commit(con);
        }
        for(int[] pair : cells)
          new PollCell(
              null,
              options.get(pair[0]).getID(),
              0 > pair[1] ? null : windows.get(pair[1]).getID())
              .commit(con);

        return null;
      });

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created poll")
          .put("poll", PollView.structure(poll));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
