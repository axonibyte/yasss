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
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import com.axonibyte.lib.db.Comparison;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.SQLBuilder.Join;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

/**
 * A poll: a proposal of candidate times, and the votes cast on them.
 *
 * <p>The question an {@link Event} cannot ask. An event is built once somebody
 * already knows when the thing is happening; a poll is how they find out. The
 * two share a grid, a short code and a publish lifecycle, and differ underneath
 * in three ways that go all the way to the schema: a poll's columns are days
 * rather than activities, its rows are times of day rather than instants, and
 * it collects one row per person rather than one per signup.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public class Poll {

  private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(Poll.class);

  /**
   * Whether a poll's columns are weekdays or dates.
   *
   * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
   */
  public static enum Scope {

    /** Columns are days of the week. "Which mornings suit you, in general?" */
    RELATIVE,

    /** Columns are specific dates. "Which of these four days can you make?" */
    ABSOLUTE;

    /**
     * Resolves a stored ordinal into a {@link Scope}.
     *
     * <p>Clamping rather than throwing, for the reason
     * {@link Detail#typeOf(int)} gives at length: a value outside the range
     * would otherwise raise {@link ArrayIndexOutOfBoundsException} from inside a
     * model getter that no endpoint catches, turning one bad row into a 500 on
     * every read of the poll containing it.
     *
     * @param ordinal the stored ordinal
     * @return the {@link Scope}, or {@link #RELATIVE} if the ordinal is unknown
     */
    public static Scope fromOrdinal(int ordinal) {
      Scope[] values = values();
      return 0 <= ordinal && ordinal < values.length ? values[ordinal] : RELATIVE;
    }
  }

  /**
   * Whose clock a poll's times are read against.
   *
   * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
   */
  public static enum TimeMode {

    /**
     * Nine o'clock means nine o'clock wherever the reader is.
     *
     * <p>The default, and the right answer for the common poll: a group who are
     * all in one place, deciding between mornings. No zone is stored and nothing
     * is ever converted, so nothing can be converted wrongly.
     */
    WALL_CLOCK,

    /**
     * The poll fixes a zone, and readers see times converted into their own.
     *
     * <p>For a meeting with a location, or a group spread across zones. Costs a
     * conversion on every render and, on a relative poll, the possibility that
     * a time crosses midnight and therefore lands on a different weekday for
     * some readers than for others -- which the grid has to show rather than
     * hide.
     */
    ZONED;

    /**
     * Resolves a stored ordinal into a {@link TimeMode}.
     *
     * @param ordinal the stored ordinal
     * @return the {@link TimeMode}, or {@link #WALL_CLOCK} if unknown
     */
    public static TimeMode fromOrdinal(int ordinal) {
      TimeMode[] values = values();
      return 0 <= ordinal && ordinal < values.length ? values[ordinal] : WALL_CLOCK;
    }
  }

  /**
   * Who may see how the votes are going, and when.
   *
   * <p>{@link #CREATOR_ONLY} is first so that it is ordinal zero, and therefore
   * what an unknown value clamps to. That is deliberate: every other fallback in
   * this file clamps towards the permissive default, and this one has to clamp
   * the other way. A row this build cannot interpret must not have its tallies
   * published on the strength of a guess.
   *
   * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
   */
  public static enum ResultVisibility {

    /** Only the organiser, ever. Requires the poll to have an organiser. */
    CREATOR_ONLY,

    /** Anybody holding the code, at any time. */
    PUBLIC_ALWAYS,

    /** Anybody holding the code, once the deadline has passed. */
    PUBLIC_AFTER_CLOSE,

    /** A respondent sees their own answer back, and no tallies at all. */
    RESPONDENT_OWN,

    /** A respondent sees the running tallies, once they have answered. */
    RESPONDENT_ALL_AFTER_SUBMIT,

    /**
     * A respondent sees the tallies once the deadline has passed.
     *
     * <p>The only setting that constrains who may answer: recognising a
     * respondent across the gap between submitting and the deadline needs an
     * account, because a token held in one browser is not an identity that
     * survives a new device or a cleared profile.
     */
    RESPONDENT_ALL_AFTER_CLOSE;

    /**
     * Resolves a stored ordinal into a {@link ResultVisibility}.
     *
     * @param ordinal the stored ordinal
     * @return the {@link ResultVisibility}, or {@link #CREATOR_ONLY} if unknown
     */
    public static ResultVisibility fromOrdinal(int ordinal) {
      ResultVisibility[] values = values();
      return 0 <= ordinal && ordinal < values.length ? values[ordinal] : CREATOR_ONLY;
    }
  }

  /**
   * Signals that an identity has already answered a poll that permits one
   * answer each.
   *
   * <p>Unchecked so that it can leave a
   * {@link com.axonibyte.lib.db.Database.TransactionalWork} lambda, which may
   * only declare {@link SQLException} -- the same reason
   * {@link Event.IdentityCapException} is unchecked.
   */
  public static final class DuplicateResponseException extends RuntimeException {
    public DuplicateResponseException() {
      super("this identity has already answered this poll");
    }
  }

  private UUID id = null;
  private UUID admin = null;
  private String shortDescription = null;
  private String longDescription = null;
  private Scope scope = Scope.RELATIVE;
  private TimeMode timeMode = TimeMode.WALL_CLOCK;
  private String timezone = null;
  private Timestamp responseDeadline = null;
  private boolean allowMultiAnswers = true;
  private boolean allowAnswerEdits = true;
  private ResultVisibility resultVisibility = ResultVisibility.CREATOR_ONLY;
  private boolean isPublished = false;
  private String code = null;
  private Timestamp firstDraftTimestamp = null;

  /**
   * Instantiates a {@link Poll}.
   *
   * @param id the {@link UUID} of this poll, or {@code null} if uncommitted
   * @param admin the {@link UUID} of the organising {@link User}, or {@code null}
   * @param shortDescription the poll's title
   * @param longDescription the poll's description
   * @param scope whether columns are weekdays or dates
   * @param firstDraftTimestamp when the poll was first drafted
   * @param isPublished whether the poll has been published
   */
  public Poll(UUID id, UUID admin, String shortDescription, String longDescription,
      Scope scope, Timestamp firstDraftTimestamp, boolean isPublished) {
    this.id = id;
    this.admin = admin;
    this.shortDescription = shortDescription;
    this.longDescription = longDescription;
    this.scope = scope;
    this.firstDraftTimestamp = firstDraftTimestamp;
    this.isPublished = isPublished;
  }

  /** @return this poll's {@link UUID} */
  public UUID getID() {
    return id;
  }

  /**
   * {@inheritDoc}
   *
   * <p>By id, as {@link Event} does, so that a poll re-read from the database
   * equals the one already in hand.
   */
  @Override public boolean equals(Object other) {
    if(this == other) return true;
    if(!(other instanceof Poll)) return false;
    Poll poll = (Poll)other;
    return null != id && id.equals(poll.id);
  }

  /**
   * {@inheritDoc}
   */
  @Override public int hashCode() {
    return null == id ? 0 : id.hashCode();
  }

  /** @return the organising account's {@link UUID}, or {@code null} */
  public UUID getAdmin() {
    return admin;
  }

  /**
   * Sets the organising account.
   *
   * @param admin the account's {@link UUID}, or {@code null}
   * @return this {@link Poll} instance
   */
  public Poll setAdmin(UUID admin) {
    this.admin = admin;
    return this;
  }

  /** @return the poll's title */
  public String getShortDescription() {
    return shortDescription;
  }

  /**
   * Sets the poll's title.
   *
   * @param shortDescription the title
   * @return this {@link Poll} instance
   */
  public Poll setShortDescription(String shortDescription) {
    this.shortDescription = shortDescription;
    return this;
  }

  /** @return the poll's description */
  public String getLongDescription() {
    return longDescription;
  }

  /**
   * Sets the poll's description.
   *
   * @param longDescription the description
   * @return this {@link Poll} instance
   */
  public Poll setLongDescription(String longDescription) {
    this.longDescription = longDescription;
    return this;
  }

  /** @return whether this poll's columns are weekdays or dates */
  public Scope getScope() {
    return scope;
  }

  /**
   * Sets whether this poll's columns are weekdays or dates.
   *
   * @param scope the {@link Scope}
   * @return this {@link Poll} instance
   */
  public Poll setScope(Scope scope) {
    this.scope = scope;
    return this;
  }

  /** @return whose clock this poll's times are read against */
  public TimeMode getTimeMode() {
    return timeMode;
  }

  /**
   * Sets whose clock this poll's times are read against.
   *
   * @param timeMode the {@link TimeMode}
   * @return this {@link Poll} instance
   */
  public Poll setTimeMode(TimeMode timeMode) {
    this.timeMode = timeMode;
    return this;
  }

  /**
   * Retrieves the IANA zone this poll's times are stated in.
   *
   * @return the zone, or {@code null} on a wall-clock poll
   */
  public String getTimezone() {
    return timezone;
  }

  /**
   * Sets the IANA zone this poll's times are stated in.
   *
   * @param timezone the zone, or {@code null}
   * @return this {@link Poll} instance
   */
  public Poll setTimezone(String timezone) {
    this.timezone = timezone;
    return this;
  }

  /**
   * Retrieves the moment after which no further answers are accepted.
   *
   * @return the deadline, or {@code null} if the poll never closes
   */
  public Timestamp getResponseDeadline() {
    return responseDeadline;
  }

  /**
   * Sets the moment after which no further answers are accepted.
   *
   * @param responseDeadline the deadline, or {@code null}
   * @return this {@link Poll} instance
   */
  public Poll setResponseDeadline(Timestamp responseDeadline) {
    this.responseDeadline = responseDeadline;
    return this;
  }

  /** @return {@code true} iff one identity may answer more than once */
  public boolean allowMultiAnswers() {
    return allowMultiAnswers;
  }

  /**
   * Sets whether one identity may answer more than once.
   *
   * @param allow {@code true} to permit repeat answers
   * @return this {@link Poll} instance
   */
  public Poll allowMultiAnswers(boolean allow) {
    this.allowMultiAnswers = allow;
    return this;
  }

  /** @return {@code true} iff a respondent may revise their answer */
  public boolean allowAnswerEdits() {
    return allowAnswerEdits;
  }

  /**
   * Sets whether a respondent may revise their answer.
   *
   * @param allow {@code true} to permit edits
   * @return this {@link Poll} instance
   */
  public Poll allowAnswerEdits(boolean allow) {
    this.allowAnswerEdits = allow;
    return this;
  }

  /** @return who may see the tallies, and when */
  public ResultVisibility getResultVisibility() {
    return resultVisibility;
  }

  /**
   * Sets who may see the tallies, and when.
   *
   * @param resultVisibility the {@link ResultVisibility}
   * @return this {@link Poll} instance
   */
  public Poll setResultVisibility(ResultVisibility resultVisibility) {
    this.resultVisibility = resultVisibility;
    return this;
  }

  /** @return {@code true} iff this poll has been published */
  public boolean isPublished() {
    return isPublished;
  }

  /**
   * Sets whether this poll has been published.
   *
   * @param publish {@code true} to publish
   * @return this {@link Poll} instance
   */
  public Poll publish(boolean publish) {
    this.isPublished = publish;
    return this;
  }

  /** @return when this poll was first drafted */
  public Timestamp getFirstDraftTimestamp() {
    return firstDraftTimestamp;
  }

  /**
   * Sets when this poll was first drafted.
   *
   * @param timestamp the {@link Timestamp}
   * @return this {@link Poll} instance
   */
  public Poll setFirstDraftTimestamp(Timestamp timestamp) {
    this.firstDraftTimestamp = timestamp;
    return this;
  }

  /**
   * Determines whether this poll has closed to further answers.
   *
   * <p>A poll with no deadline never closes. That is not an oversight to guard
   * against: a relative poll has no dates that could pass, so a deadline is the
   * only thing that could ever close one, and choosing not to set one is a
   * legitimate way to run an open-ended poll.
   *
   * @return {@code true} iff the deadline has passed
   */
  public boolean isClosed() {
    return null != responseDeadline && responseDeadline.before(new Date());
  }

  /**
   * Determines whether answering this poll requires an account.
   *
   * @return {@code true} iff only signed-in visitors may answer
   */
  public boolean requiresAuthenticatedAnswers() {
    return ResultVisibility.RESPONDENT_ALL_AFTER_CLOSE == resultVisibility;
  }

  /**
   * Determines whether this poll's result setting is meaningless without a
   * deadline.
   *
   * @return {@code true} iff a deadline must be set before publishing
   */
  public boolean requiresDeadline() {
    return ResultVisibility.PUBLIC_AFTER_CLOSE == resultVisibility
        || ResultVisibility.RESPONDENT_ALL_AFTER_CLOSE == resultVisibility;
  }

  /**
   * Decides whether aggregate tallies may be shown.
   *
   * <p>Static and free of any database or authorization type on purpose: this
   * is the one rule that decides whether votes leak, and it should be provable
   * by a test that constructs six settings against three kinds of caller
   * without standing up so much as a connection.
   *
   * <p>The organiser always sees their own poll's results. The settings
   * describe what everybody <em>else</em> gets; a setting that hid the tallies
   * from the person who ran the poll would leave nobody able to act on it.
   *
   * @param visibility the poll's {@link ResultVisibility}
   * @param owner whether the caller organises this poll
   * @param responded whether the caller has already answered
   * @param closed whether the poll's deadline has passed
   * @return {@code true} iff the tallies may be disclosed
   */
  public static boolean tallyVisible(ResultVisibility visibility, boolean owner,
      boolean responded, boolean closed) {
    if(owner) return true;
    return switch(visibility) {
      case CREATOR_ONLY -> false;
      case PUBLIC_ALWAYS -> true;
      case PUBLIC_AFTER_CLOSE -> closed;
      case RESPONDENT_OWN -> false;
      case RESPONDENT_ALL_AFTER_SUBMIT -> responded;
      case RESPONDENT_ALL_AFTER_CLOSE -> responded && closed;
    };
  }

  /**
   * Decides whether aggregate tallies may be shown to a particular caller.
   *
   * @param owner whether the caller organises this poll
   * @param responded whether the caller has already answered
   * @return {@code true} iff the tallies may be disclosed
   */
  public boolean tallyVisibleTo(boolean owner, boolean responded) {
    return tallyVisible(resultVisibility, owner, responded, isClosed());
  }

  /**
   * Retrieves this poll's columns, in the order they render.
   *
   * @return a {@link Set} of {@link PollOption} objects
   * @throws SQLException if a database malfunction occurs
   */
  public Set<PollOption> getOptions() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_option",
                  "id",
                  "poll",
                  "day_of_week",
                  "option_date",
                  "all_day",
                  "priority")
              .where("poll")
              .order("priority", Order.ASC)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();

      Set<PollOption> options = new TreeSet<>();
      while(res.next())
        options.add(
            PollOption.from(
                SQLBuilder.bytesToUUID(
                    res.getBytes("id")),
                res));
      return options;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Retrieves a specific column of this poll.
   *
   * @param optionID the {@link UUID} of the {@link PollOption}
   * @return the {@link PollOption} if it belongs to this poll, else {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public PollOption getOption(UUID optionID) throws SQLException {
    PollOption option = PollOption.getOption(optionID);
    // Checked here rather than trusted from the path. Endpoints address an
    // option under its poll, and an id belonging to somebody else's poll must
    // read as absent rather than as a thing this caller may edit.
    return null != option && null != id && id.equals(option.getPoll()) ? option : null;
  }

  /**
   * Retrieves this poll's rows, earliest first.
   *
   * @return a {@link Set} of {@link PollWindow} objects
   * @throws SQLException if a database malfunction occurs
   */
  public Set<PollWindow> getWindows() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_window",
                  "id",
                  "start_time",
                  "applies_to_new_options")
              .where("poll")
              .order("start_time", Order.ASC)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();

      Set<PollWindow> windows = new TreeSet<>();
      while(res.next())
        windows.add(
            new PollWindow(
                SQLBuilder.bytesToUUID(
                    res.getBytes("id")),
                id,
                res.getTime("start_time"),
                res.getBoolean("applies_to_new_options")));
      return windows;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Retrieves a specific row of this poll.
   *
   * @param windowID the {@link UUID} of the {@link PollWindow}
   * @return the {@link PollWindow} if it belongs to this poll, else {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public PollWindow getWindow(UUID windowID) throws SQLException {
    PollWindow window = PollWindow.getWindow(windowID);
    return null != window && null != id && id.equals(window.getPoll()) ? window : null;
  }

  /**
   * Retrieves every square this poll offers.
   *
   * @return a {@link Set} of {@link PollCell} objects
   * @throws SQLException if a database malfunction occurs
   */
  public Set<PollCell> getCells() throws SQLException {
    return PollCell.getCells(id);
  }

  /**
   * Retrieves the custom questions this poll asks.
   *
   * @return a {@link Set} of {@link PollDetail} objects
   * @throws SQLException if a database malfunction occurs
   */
  public Set<PollDetail> getDetails() throws SQLException {
    return PollDetail.getDetails(id);
  }

  /**
   * Retrieves a specific question this poll asks.
   *
   * @param detailID the {@link UUID} of the {@link PollDetail}
   * @return the {@link PollDetail} if it belongs to this poll, else {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public PollDetail getDetail(UUID detailID) throws SQLException {
    PollDetail detail = PollDetail.getDetail(detailID);
    return null != detail && null != id && id.equals(detail.getPoll()) ? detail : null;
  }

  /**
   * Retrieves the answers given to this poll, oldest first.
   *
   * @return a {@link List} of {@link PollResponse} objects
   * @throws SQLException if a database malfunction occurs
   */
  public List<PollResponse> getResponses() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    List<PollResponse> responses = new ArrayList<>();
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_response",
                  "id",
                  "poll",
                  "user",
                  "name",
                  "ip_addr_bin",
                  "fingerprint",
                  "edit_token",
                  "submitted")
              .where("poll")
              .wrap(new com.axonibyte.lib.db.Wrapper(5, "INET6_NTOA"))
              .order("submitted", Order.ASC)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();

      while(res.next())
        responses.add(
            PollResponse.from(
                SQLBuilder.bytesToUUID(
                    res.getBytes("id")),
                res));

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    // Votes and answers loaded per response, after the projection is closed.
    // Doing it inside the loop above would run a second query on a connection
    // that is still streaming the first, which is exactly the shape that
    // exhausts the pool under load.
    for(PollResponse response : responses) {
      response.setVotes(PollVote.getVotes(response.getID()));
      response.loadDetails();
    }
    return responses;
  }

  /**
   * Retrieves a specific answer to this poll.
   *
   * @param responseID the {@link UUID} of the {@link PollResponse}
   * @return the {@link PollResponse} if it belongs to this poll, else {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public PollResponse getResponse(UUID responseID) throws SQLException {
    PollResponse response = PollResponse.getResponse(responseID);
    return null != response && null != id && id.equals(response.getPoll()) ? response : null;
  }

  /**
   * Takes this poll's row lock.
   *
   * <p>Verbatim in shape from {@link Event#lock(Connection)}, and for the same
   * reason: the single-answer rule is a count followed by an insert, and
   * nothing else holds the gap between them, so simultaneous answers from one
   * address would all count zero and all proceed.
   *
   * <p>Only taken when the rule actually applies. Locking unconditionally would
   * serialize every answer to a poll that permits several, which is the default
   * and the case that most wants to be parallel.
   *
   * @param con the {@link Connection} running the transaction
   * @throws SQLException if a database malfunction occurs
   */
  public void lock(Connection con) throws SQLException {
    try(PreparedStatement stmt = con.prepareStatement(
        "SELECT id FROM " + YasssCore.getDB().getPrefix() + "poll WHERE id = ? FOR UPDATE")) {
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.executeQuery().close();
    }
  }

  /**
   * Counts the answers matching an identity, on a caller-supplied connection.
   *
   * <p>Hand-built rather than assembled with {@link SQLBuilder}, because the
   * anonymous case needs {@code (ip = ? OR fingerprint = ?)} and
   * {@code SQLBuilder.where} conjoins. An AND here would mean an answer was
   * only a duplicate when the address <em>and</em> the browser both matched,
   * which any change of network defeats -- so the one predicate that carries the
   * whole rule is written out where it can be read.
   *
   * <p>The connection is the caller's and is deliberately not closed here.
   *
   * @param con the {@link Connection} to use
   * @param user the account to scope to, or {@code null}
   * @param ipAddr the address to scope to, or {@code null}
   * @param fingerprint the salted fingerprint to scope to, or {@code null}
   * @return the number of matching answers
   * @throws SQLException if a database malfunction occurs
   */
  public int countResponses(Connection con, UUID user, String ipAddr, byte[] fingerprint)
      throws SQLException {
    StringBuilder sql = new StringBuilder(
        "SELECT COUNT(id) AS response_count FROM "
            + YasssCore.getDB().getPrefix() + "poll_response WHERE poll = ?");
    List<Object> params = new ArrayList<>();
    params.add(SQLBuilder.uuidToBytes(id));

    if(null != user) {
      sql.append(" AND user = ?");
      params.add(SQLBuilder.uuidToBytes(user));
    } else {
      List<String> identity = new ArrayList<>();
      if(null != ipAddr) {
        identity.add("ip_addr_bin = INET6_ATON(?)");
        params.add(ipAddr);
      }
      if(null != fingerprint) {
        identity.add("fingerprint = ?");
        params.add(fingerprint);
      }
      // No identity at all -- an anonymous caller behind a proxy that strips the
      // address, with a browser that produced no digest. Counting zero would
      // wave them through; counting every answer would block the poll for
      // everybody. Matching nothing is the honest reading: there is no evidence
      // this person has answered before.
      if(identity.isEmpty()) return 0;
      sql.append(" AND (").append(String.join(" OR ", identity)).append(')');
    }

    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      stmt = con.prepareStatement(sql.toString());
      for(int i = 0; i < params.size(); i++) {
        Object param = params.get(i);
        if(param instanceof byte[]) stmt.setBytes(i + 1, (byte[])param);
        else stmt.setString(i + 1, (String)param);
      }
      res = stmt.executeQuery();
      res.next();
      return res.getInt("response_count");

    } finally {
      // The statement and result set, not the connection: that is the caller's.
      YasssCore.getDB().close(null, stmt, res);
    }
  }

  /**
   * Retrieves an ordered set of polls that conform to provided criteria.
   *
   * @param adminID the organising account, or {@code null}
   * @param respondentID an account that has answered, or {@code null}
   * @param labelSubstr a needle to search for in the haystack of poll titles
   * @param page the page to retrieve, or {@code null}
   * @param limit the page size, or {@code null}
   * @return a {@link Set} of {@link Poll} objects
   * @throws SQLException if a database malfunction occurs
   */
  public static Set<Poll> getPolls(UUID adminID, UUID respondentID, String labelSubstr,
      Integer page, Integer limit) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    SQLBuilder query = new SQLBuilder()
        .select(
            YasssCore.getDB().getPrefix() + "poll",
            "p.id",
            "p.admin_user",
            "p.short_description",
            "p.long_description",
            "p.scope",
            "p.time_mode",
            "p.timezone",
            "p.response_deadline",
            "p.allow_multi_answers",
            "p.allow_answer_edits",
            "p.result_visibility",
            "p.published",
            "p.code",
            "p.first_draft")
        .tableAlias("p")
        .order("p.first_draft", Order.DESC);

    if(null != respondentID)
      query
          .join(
              Join.INNER,
              YasssCore.getDB().getPrefix() + "poll_response",
              "r",
              new Comparison("p.id", "r.poll", ComparisonOp.EQUAL_TO))
          .where("r.user", ComparisonOp.EQUAL_TO)
          // One row per poll, not per answer. A poll that permits several
          // answers from one account would otherwise come back once per answer.
          .group("p.id");
    if(null != adminID)
      query.where("p.admin_user", ComparisonOp.EQUAL_TO);
    if(null != labelSubstr)
      query.where("p.short_description", ComparisonOp.LIKE);
    if(null != page)
      query.limit(limit, limit * (page - 1));
    else if(null != limit)
      query.limit(limit);

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(query.toString());

      int idx = 0;
      if(null != respondentID)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(respondentID));
      if(null != adminID)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(adminID));
      if(null != labelSubstr)
        stmt.setString(++idx, labelSubstr);

      res = stmt.executeQuery();

      Set<Poll> polls = new LinkedHashSet<>();
      while(res.next()) polls.add(from(res, "p."));
      return polls;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Counts the polls that meet the specified criteria.
   *
   * @param adminID the organising account, or {@code null}
   * @param respondentID an account that has answered, or {@code null}
   * @param labelSubstr a needle to search for in the haystack of poll titles
   * @return the number of matching polls, ignoring pagination
   * @throws SQLException if a database malfunction occurs
   */
  public static int countPolls(UUID adminID, UUID respondentID, String labelSubstr)
      throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    SQLBuilder query = new SQLBuilder()
        .select(
            YasssCore.getDB().getPrefix() + "poll")
        // DISTINCT, for the reason countEvents gives: the respondent join
        // multiplies rows for an account holding more than one answer, and
        // counting those reports more polls than exist and pages past the end.
        .count("DISTINCT p.id", "poll_count")
        .tableAlias("p");

    if(null != respondentID)
      query
          .join(
              Join.INNER,
              YasssCore.getDB().getPrefix() + "poll_response",
              "r",
              new Comparison("p.id", "r.poll", ComparisonOp.EQUAL_TO))
          .where("r.user", ComparisonOp.EQUAL_TO);
    if(null != adminID)
      query.where("p.admin_user", ComparisonOp.EQUAL_TO);
    if(null != labelSubstr)
      query.where("p.short_description", ComparisonOp.LIKE);

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(query.toString());

      int idx = 0;
      if(null != respondentID)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(respondentID));
      if(null != adminID)
        stmt.setBytes(++idx, SQLBuilder.uuidToBytes(adminID));
      if(null != labelSubstr)
        stmt.setString(++idx, labelSubstr);

      res = stmt.executeQuery();
      res.next();
      return res.getInt("poll_count");

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Retrieves a specific {@link Poll} from the database.
   *
   * @param pollID the {@link UUID} of the poll
   * @return the {@link Poll}, if it exists, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static Poll getPoll(UUID pollID) throws SQLException {
    if(null == pollID) return null;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll",
                  "id",
                  "admin_user",
                  "short_description",
                  "long_description",
                  "scope",
                  "time_mode",
                  "timezone",
                  "response_deadline",
                  "allow_multi_answers",
                  "allow_answer_edits",
                  "result_visibility",
                  "published",
                  "code",
                  "first_draft")
              .where("id")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(pollID));
      res = stmt.executeQuery();

      if(res.next()) return from(res, "");

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return null;
  }

  /**
   * Builds a poll from a row that already carries every column.
   *
   * @param res the {@link ResultSet}, positioned on the row
   * @param prefix the column-name prefix in play, {@code ""} or an alias
   * @return the {@link Poll}
   * @throws SQLException if a database malfunction occurs
   */
  private static Poll from(ResultSet res, String prefix) throws SQLException {
    return new Poll(
        SQLBuilder.bytesToUUID(
            res.getBytes(prefix + "id")),
        SQLBuilder.bytesToUUID(
            res.getBytes(prefix + "admin_user")),
        res.getString(prefix + "short_description"),
        res.getString(prefix + "long_description"),
        Scope.fromOrdinal(res.getInt(prefix + "scope")),
        res.getTimestamp(prefix + "first_draft"),
        res.getBoolean(prefix + "published"))
        .setTimeMode(TimeMode.fromOrdinal(res.getInt(prefix + "time_mode")))
        .setTimezone(res.getString(prefix + "timezone"))
        .setResponseDeadline(res.getTimestamp(prefix + "response_deadline"))
        .allowMultiAnswers(res.getBoolean(prefix + "allow_multi_answers"))
        .allowAnswerEdits(res.getBoolean(prefix + "allow_answer_edits"))
        .setResultVisibility(
            ResultVisibility.fromOrdinal(res.getInt(prefix + "result_visibility")))
        .setCode(res.getString(prefix + "code"));
  }

  /**
   * Retrieves this poll's short, human-copyable code.
   *
   * @return the canonical code, or {@code null} if one has not been assigned
   */
  public String getCode() {
    return code;
  }

  /**
   * Sets this poll's short code.
   *
   * <p>Normalized on the way in, so a value read back from a row written by
   * some other hand cannot make two spellings of one code compare unequal.
   *
   * @param code the code, in any spelling
   * @return this {@link Poll} instance
   */
  public Poll setCode(String code) {
    this.code = EventCode.normalize(code);
    return this;
  }

  /**
   * Retrieves a {@link Poll} by its short code.
   *
   * @param rawCode the code, in any spelling
   * @return the {@link Poll}, if one holds that code, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static Poll getPollByCode(String rawCode) throws SQLException {
    String canonical = EventCode.normalize(rawCode);
    if(null == canonical) return null;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll",
                  "id")
              .where("code")
              .limit(1)
              .toString());
      stmt.setString(1, canonical);
      res = stmt.executeQuery();

      // Resolved to an id and then loaded the ordinary way, rather than keeping
      // a second copy of the fourteen-column projection getPoll maintains.
      return res.next()
          ? getPoll(SQLBuilder.bytesToUUID(res.getBytes("id")))
          : null;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Saves this {@link Poll} to the database. If it already exists, it is merely
   * updated.
   *
   * @throws SQLException if a database malfunction occurs
   */
  public void commit() throws SQLException {
    // Retried rather than checked-then-inserted, for the reason Event.commit
    // gives: the unique index on the code is the authority, so a collision is a
    // duplicate-key violation to catch and not a race to lose.
    for(int attempt = 0; ; attempt++) {
      try {
        commitOnce();
        return;
      } catch(SQLException e) {
        if(CODE_ATTEMPTS <= attempt || !isCodeCollision(e)) throw e;
        code = null;
      }
    }
  }

  /** How many fresh codes to try before giving up and surfacing the error. */
  private static final int CODE_ATTEMPTS = 5;

  /**
   * Whether a failure was this poll's code colliding with an existing one.
   *
   * <p>Matched on the index name so that a duplicate on any other constraint is
   * not silently retried into a different failure.
   */
  private static boolean isCodeCollision(SQLException e) {
    return AccessCode.isCodeCollision(e);
  }

  private void commitOnce() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    if(null == id) {
      do {
        id = UUID.randomUUID();
      } while(null != getPoll(id));
    }

    // Assigned on first write and never reissued: a code is what people have
    // written down and shared. `minted` records whether this call is the one
    // assigning it -- see the matching note in Event.commitOnce.
    final boolean minted = (null == code);
    if(minted) code = EventCode.generate();

    try {
      con = YasssCore.getDB().connect();

      // Claimed against the shared registry before the row is written, which is
      // what stops a poll and an event from ever holding the same eight
      // characters. commit()'s retry loop handles the collision.
      if(minted) AccessCode.claim(con, AccessCode.Kind.POLL, id, code);

      stmt = con.prepareStatement(
          new SQLBuilder()
              .update(
                  YasssCore.getDB().getPrefix() + "poll",
                  "admin_user",
                  "short_description",
                  "long_description",
                  "scope",
                  "time_mode",
                  "timezone",
                  "response_deadline",
                  "allow_multi_answers",
                  "allow_answer_edits",
                  "result_visibility",
                  "published",
                  "code",
                  "first_draft")
              .where("id")
              .toString());
      bind(stmt, 1);
      stmt.setBytes(14, SQLBuilder.uuidToBytes(id));

      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "poll",
                    "id",
                    "admin_user",
                    "short_description",
                    "long_description",
                    "scope",
                    "time_mode",
                    "timezone",
                    "response_deadline",
                    "allow_multi_answers",
                    "allow_answer_edits",
                    "result_visibility",
                    "published",
                    "code",
                    "first_draft")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        bind(stmt, 2);
        stmt.executeUpdate();
      }

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Binds the thirteen value columns, in the order both statements list them.
   *
   * <p>Shared so that the UPDATE and the INSERT cannot drift into binding the
   * same column list in two different orders -- which is a silent data
   * corruption rather than an error, since most of these columns are the same
   * SQL type as their neighbours.
   *
   * @param stmt the statement to bind
   * @param offset the index of the first value column
   * @throws SQLException if a database malfunction occurs
   */
  private void bind(PreparedStatement stmt, int offset) throws SQLException {
    stmt.setBytes(offset, SQLBuilder.uuidToBytes(admin));
    stmt.setString(offset + 1, shortDescription);
    stmt.setString(offset + 2, longDescription);
    stmt.setInt(offset + 3, scope.ordinal());
    stmt.setInt(offset + 4, timeMode.ordinal());
    stmt.setString(offset + 5, timezone);
    stmt.setTimestamp(offset + 6, responseDeadline);
    stmt.setBoolean(offset + 7, allowMultiAnswers);
    stmt.setBoolean(offset + 8, allowAnswerEdits);
    stmt.setInt(offset + 9, resultVisibility.ordinal());
    stmt.setBoolean(offset + 10, isPublished);
    stmt.setString(offset + 11, code);
    stmt.setTimestamp(offset + 12, firstDraftTimestamp);
  }

  /**
   * Gives a code to every poll that somehow lacks one.
   *
   * <p>Idempotent and self-limiting, in the shape {@link Event#backfillCodes()}
   * established: it selects only rows with no code, so on every boot after the
   * first it is one indexed query returning nothing. A row that cannot be given
   * a code is logged and skipped rather than blocking startup -- a poll without
   * a short code still works perfectly well by {@link UUID}.
   *
   * @return the number of polls given a code
   * @throws SQLException if a database malfunction occurs
   */
  public static int backfillCodes() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    List<UUID> pending = new ArrayList<>();
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          "SELECT id FROM " + YasssCore.getDB().getPrefix() + "poll WHERE code IS NULL");
      res = stmt.executeQuery();
      while(res.next()) pending.add(SQLBuilder.bytesToUUID(res.getBytes("id")));
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    int done = 0;
    for(UUID pollID : pending) {
      Poll poll = getPoll(pollID);
      if(null == poll) continue;
      try {
        poll.commit();
        done++;
      } catch(SQLException e) {
        LOG.error("could not assign a code to poll {}: {}", pollID, e.getMessage());
      }
    }
    return done;
  }

  /**
   * Removes this {@link Poll} from the database.
   *
   * <p>Its columns, rows, questions, squares, answers and votes go with it, by
   * cascade -- including every stored fingerprint, which is what makes "it is
   * deleted with the poll" a property of the schema rather than a promise.
   *
   * @throws SQLException if a database malfunction occurs
   */
  public void delete() throws SQLException {
    if(null == id) return;

    AccessCode.release(AccessCode.Kind.POLL, id);

    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "poll")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
}
