/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.sql.Time;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.PollCell;
import com.crowdease.yasss.model.PollDetail;
import com.crowdease.yasss.model.PollOption;
import com.crowdease.yasss.model.PollResponse;
import com.crowdease.yasss.model.PollWindow;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * How a {@link Poll} is rendered onto the wire.
 *
 * <p>One place, rather than a copy in each of create, retrieve and modify. The
 * event endpoints each build their own projection, and the cost of that shows:
 * a window comes back as {@code begin}/{@code end} from one endpoint and
 * {@code beginTime}/{@code endTime} from the others, and the frontend carries a
 * function whose entire job is to absorb the difference. Polls get one shape.
 *
 * <p>Enums travel as their names rather than their ordinals, matching
 * {@code detail.type} on the event side: the ordinals are a storage detail, and
 * a client that has to know {@code 2} means {@code PUBLIC_AFTER_CLOSE} is a
 * client that breaks when a value is inserted.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
final class PollView {

  private PollView() { }

  /**
   * Renders a time of day as {@code HH:mm}.
   *
   * <p>{@link Time#toString()} answers {@code HH:mm:ss}, and the seconds are
   * always zero because {@code validTime} refuses to accept any others. Sending
   * them would invite a client to send them back.
   *
   * @param time the stored start time
   * @return the time as {@code HH:mm}
   */
  static String hhmm(Time time) {
    return time.toString().substring(0, 5);
  }

  /**
   * Renders a poll and everything structural about it.
   *
   * <p>Deliberately does not include votes, tallies or responses. Who may see
   * those is a question with six answers and a deadline in it, and mixing it
   * into the projection every endpoint uses is how a rule like that comes to be
   * applied in three places and forgotten in a fourth.
   *
   * @param poll the {@link Poll}
   * @return the poll as a {@link JSONObject}
   * @throws SQLException if a database malfunction occurs
   */
  static JSONObject structure(Poll poll) throws SQLException {
    JSONArray optionArr = new JSONArray();
    for(PollOption option : poll.getOptions())
      optionArr.put(option(option));

    JSONArray windowArr = new JSONArray();
    for(PollWindow window : poll.getWindows())
      windowArr.put(window(window));

    JSONArray detailArr = new JSONArray();
    for(PollDetail detail : poll.getDetails())
      detailArr.put(detail(detail));

    JSONArray cellArr = new JSONArray();
    for(PollCell cell : poll.getCells())
      cellArr.put(cell(cell));

    return new JSONObject()
        .put("id", poll.getID())
        .put("admin", poll.getAdmin())
        .put("shortDescription", poll.getShortDescription())
        .put("longDescription", poll.getLongDescription())
        .put("scope", poll.getScope())
        .put("timeMode", poll.getTimeMode())
        .put("timezone", poll.getTimezone())
        // As a string, matching how the event endpoints send window times: a
        // JSON number is a double, and an epoch in milliseconds is past the
        // point where every one of those is exactly representable.
        .put(
            "responseDeadline",
            null == poll.getResponseDeadline()
                ? JSONObject.NULL
                : Long.toString(poll.getResponseDeadline().getTime()))
        .put("allowMultiAnswers", poll.allowMultiAnswers())
        .put("allowAnswerEdits", poll.allowAnswerEdits())
        .put("resultVisibility", poll.getResultVisibility())
        .put("isPublished", poll.isPublished())
        .put("code", poll.getCode())
        .put("closed", poll.isClosed())
        .put("requiresAuthenticatedAnswers", poll.requiresAuthenticatedAnswers())
        .put("options", optionArr)
        .put("windows", windowArr)
        .put("details", detailArr)
        .put("cells", cellArr);
  }

  /**
   * Renders one answer.
   *
   * <p>The identity columns are never rendered. An IP address and a browser
   * fingerprint are collected to make a second answer inconvenient and for no
   * other purpose, and sending either back -- even to the organiser, who is the
   * only one who could ask -- would turn a duplicate check into a report on who
   * answered from where.
   *
   * @param response the {@link PollResponse}
   * @param withToken whether to include the edit token
   * @return the answer as a {@link JSONObject}
   */
  static JSONObject response(PollResponse response, boolean withToken) {
    JSONArray voteArr = new JSONArray();
    for(UUID cellID : response.getVotes()) voteArr.put(cellID);

    JSONArray answerArr = new JSONArray();
    for(var answer : response.getDetails().entrySet())
      answerArr.put(
          new JSONObject()
              .put("detail", answer.getKey().getID())
              .put("value", answer.getValue()));

    JSONObject out = new JSONObject()
        .put("id", response.getID())
        .put("user", null == response.getUser() ? JSONObject.NULL : response.getUser())
        .put("name", response.getName())
        .put("submitted", Long.toString(response.getSubmitted().getTime()))
        .put("votes", voteArr)
        .put("details", answerArr);

    // Handed over exactly once, in the reply to the submission that minted it.
    // It is the only thing an anonymous respondent can present to prove an
    // answer is theirs, so anywhere else it appears is somewhere it can leak.
    if(withToken && null != response.getEditToken())
      out.put("editToken", response.getEditToken());

    return out;
  }

  /**
   * Renders the vote counts.
   *
   * <p>Squares with no votes are absent from the map, so the caller reads a
   * missing key as zero. Whether this is included at all is
   * {@link com.crowdease.yasss.model.Poll#tallyVisible} and is decided before
   * this is called.
   *
   * @param counts the counts, by {@link com.crowdease.yasss.model.PollCell} id
   * @param respondents how many people have answered at all
   * @return the tally as a {@link JSONObject}
   */
  static JSONObject tally(Map<UUID, Integer> counts, int respondents) {
    JSONObject byCell = new JSONObject();
    for(var count : counts.entrySet())
      byCell.put(count.getKey().toString(), count.getValue().intValue());

    return new JSONObject()
        // Distinct from the largest per-square count on purpose: somebody may
        // answer and choose nothing, which is a meaningful reply -- "none of
        // these work" -- and a denominator that ignored them would overstate
        // how well the best square did.
        .put("respondents", respondents)
        .put("byCell", byCell);
  }

  /**
   * Renders one column.
   *
   * @param option the {@link PollOption}
   * @return the column as a {@link JSONObject}
   */
  static JSONObject option(PollOption option) {
    return new JSONObject()
        .put("id", option.getID())
        // Exactly one of these is ever set, and both are sent regardless so a
        // client can read the one its scope calls for without branching on
        // which keys are present.
        .put(
            "dayOfWeek",
            null == option.getDayOfWeek() ? JSONObject.NULL : option.getDayOfWeek())
        .put(
            "date",
            null == option.getDate() ? JSONObject.NULL : option.getDate().toString())
        .put("allDay", option.isAllDay())
        .put("priority", option.getPriority());
  }

  /**
   * Renders one row.
   *
   * @param window the {@link PollWindow}
   * @return the row as a {@link JSONObject}
   */
  static JSONObject window(PollWindow window) {
    return new JSONObject()
        .put("id", window.getID())
        .put("startTime", hhmm(window.getStartTime()))
        .put("appliesToNewOptions", window.appliesToNewOptions());
  }

  /**
   * Renders one custom question.
   *
   * @param detail the {@link PollDetail}
   * @return the question as a {@link JSONObject}
   */
  static JSONObject detail(PollDetail detail) {
    return new JSONObject()
        .put("id", detail.getID())
        .put("type", detail.getType())
        .put("label", detail.getLabel())
        .put("hint", detail.getHint())
        .put("priority", detail.getPriority())
        .put("required", detail.isRequired());
  }

  /**
   * Renders one votable square.
   *
   * <p>A null {@code window} is the all-day square, which is the same shape the
   * database stores and the same shape a vote references. Squares are sent as a
   * flat list rather than nested inside their column, because they are
   * addressed by their own id everywhere else and nesting would make the id
   * that matters the least prominent thing in the payload.
   *
   * @param cell the {@link PollCell}
   * @return the square as a {@link JSONObject}
   */
  static JSONObject cell(PollCell cell) {
    return new JSONObject()
        .put("id", cell.getID())
        .put("option", cell.getOption())
        .put("window", null == cell.getWindow() ? JSONObject.NULL : cell.getWindow())
        .put("allDay", cell.isAllDay());
  }
}
