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
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

/**
 * A custom question a {@link Poll} asks the people answering it.
 *
 * <p>The same idea as {@link Detail}, against a different parent, and
 * deliberately reusing {@link Detail.Type} rather than declaring a second enum
 * of the same five datatypes. Two copies of those regular expressions would
 * mean an email address that a poll accepts and an event rejects, or the
 * reverse, and no obvious place to notice.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public class PollDetail implements Comparable<PollDetail> {

  private UUID id = null;
  private UUID poll = null;
  private Detail.Type type = Detail.Type.STRING;
  private String label = null;
  private String hint = null;
  private int priority = 0;
  private boolean required = false;

  /**
   * Instantiates a {@link PollDetail}.
   *
   * @param id the {@link UUID} of this question, or {@code null} if uncommitted
   * @param poll the {@link UUID} of the {@link Poll} this belongs to
   * @param type the question's {@link Detail.Type}
   * @param label the question itself
   * @param hint the hint shown alongside it
   * @param priority the question's ordering weight
   * @param required {@code true} iff an answer must be given
   */
  public PollDetail(UUID id, UUID poll, Detail.Type type, String label, String hint,
      int priority, boolean required) {
    this.id = id;
    this.poll = poll;
    this.type = type;
    this.label = label;
    this.hint = hint;
    this.priority = priority;
    this.required = required;
  }

  /** @return this question's {@link UUID} */
  public UUID getID() {
    return id;
  }

  /** @return the {@link UUID} of the {@link Poll} this question belongs to */
  public UUID getPoll() {
    return poll;
  }

  /**
   * Sets the {@link UUID} of the {@link Poll} this question belongs to.
   *
   * @param poll the poll's {@link UUID}
   * @return this {@link PollDetail} instance
   */
  public PollDetail setPoll(UUID poll) {
    this.poll = poll;
    return this;
  }

  /** @return this question's {@link Detail.Type} */
  public Detail.Type getType() {
    return type;
  }

  /**
   * Sets this question's datatype.
   *
   * @param type the {@link Detail.Type}
   * @return this {@link PollDetail} instance
   */
  public PollDetail setType(Detail.Type type) {
    this.type = type;
    return this;
  }

  /** @return the question itself */
  public String getLabel() {
    return label;
  }

  /**
   * Sets the question itself.
   *
   * @param label the question
   * @return this {@link PollDetail} instance
   */
  public PollDetail setLabel(String label) {
    this.label = label;
    return this;
  }

  /** @return the hint shown alongside the question */
  public String getHint() {
    return hint;
  }

  /**
   * Sets the hint shown alongside the question.
   *
   * @param hint the hint
   * @return this {@link PollDetail} instance
   */
  public PollDetail setHint(String hint) {
    this.hint = hint;
    return this;
  }

  /** @return this question's ordering weight */
  public int getPriority() {
    return priority;
  }

  /**
   * Sets this question's ordering weight.
   *
   * @param priority the priority
   * @return this {@link PollDetail} instance
   */
  public PollDetail setPriority(int priority) {
    this.priority = priority;
    return this;
  }

  /** @return {@code true} iff an answer must be given */
  public boolean isRequired() {
    return required;
  }

  /**
   * Sets whether an answer must be given.
   *
   * @param required {@code true} iff an answer is mandatory
   * @return this {@link PollDetail} instance
   */
  public PollDetail setRequired(boolean required) {
    this.required = required;
    return this;
  }

  /**
   * Determines whether a submitted answer is acceptable.
   *
   * <p>Delegates to {@link Detail.Type}, so a poll and an event agree on what
   * counts as an email address by construction rather than by review.
   *
   * @param candidate the submitted answer
   * @return {@code true} iff the answer is valid for this question
   */
  public boolean isValid(String candidate) {
    if(required && (null == candidate || candidate.isBlank()))
      return false;
    return type.isValid(candidate);
  }

  /**
   * Retrieves every question a {@link Poll} asks, in the order they render.
   *
   * @param pollID the {@link UUID} of the {@link Poll}
   * @return a {@link Set} of {@link PollDetail} objects
   * @throws SQLException if a database malfunction occurs
   */
  public static Set<PollDetail> getDetails(UUID pollID) throws SQLException {
    Set<PollDetail> details = new TreeSet<>();
    if(null == pollID) return details;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_detail",
                  "id",
                  "poll",
                  "detail_type",
                  "label",
                  "hint",
                  "priority",
                  "required")
              .where("poll")
              .order("priority", Order.ASC)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(pollID));
      res = stmt.executeQuery();

      while(res.next())
        details.add(
            from(
                SQLBuilder.bytesToUUID(
                    res.getBytes("id")),
                res));
      return details;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Retrieves a specific {@link PollDetail} from the database.
   *
   * @param detailID the {@link UUID} of the question
   * @return the {@link PollDetail}, if it exists, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static PollDetail getDetail(UUID detailID) throws SQLException {
    if(null == detailID) return null;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_detail",
                  "poll",
                  "detail_type",
                  "label",
                  "hint",
                  "priority",
                  "required")
              .where("id")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(detailID));
      res = stmt.executeQuery();

      if(res.next()) return from(detailID, res);

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return null;
  }

  /**
   * Builds a question from a row that already carries every column.
   *
   * @param detailID the question's {@link UUID}
   * @param res the {@link ResultSet}, positioned on the row
   * @return the {@link PollDetail}
   * @throws SQLException if a database malfunction occurs
   */
  static PollDetail from(UUID detailID, ResultSet res) throws SQLException {
    return new PollDetail(
        detailID,
        SQLBuilder.bytesToUUID(
            res.getBytes("poll")),
        // Through Detail.typeOf rather than values()[...] -- an out-of-range
        // ordinal must not turn a bad row into a 500 on every read of the poll
        // that contains it. See the note on that method.
        Detail.typeOf(res.getInt("detail_type")),
        res.getString("label"),
        res.getString("hint"),
        res.getInt("priority"),
        res.getBoolean("required"));
  }

  /**
   * Saves this {@link PollDetail} to the database, updating it if it already
   * exists.
   *
   * @throws SQLException if a database malfunction occurs
   */
  public void commit() throws SQLException {
    Connection con = null;
    try {
      con = YasssCore.getDB().connect();
      commit(con);
    } finally {
      YasssCore.getDB().close(con, null, null);
    }
  }

  /**
   * Saves this {@link PollDetail} on a caller-supplied connection.
   *
   * <p>The connection is the caller's and is deliberately not closed here.
   *
   * @param con the {@link Connection} to use
   * @throws SQLException if a database malfunction occurs
   */
  public void commit(Connection con) throws SQLException {
    PreparedStatement stmt = null;

    try {
      if(null == id) {
        ResultSet res = null;
        stmt = con.prepareStatement(
            new SQLBuilder()
                .select(
                    YasssCore.getDB().getPrefix() + "poll_detail",
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
                  YasssCore.getDB().getPrefix() + "poll_detail",
                  "poll",
                  "detail_type",
                  "label",
                  "hint",
                  "priority",
                  "required")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(poll));
      stmt.setInt(2, type.ordinal());
      stmt.setString(3, label);
      stmt.setString(4, hint);
      stmt.setInt(5, priority);
      stmt.setBoolean(6, required);
      stmt.setBytes(7, SQLBuilder.uuidToBytes(id));

      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "poll_detail",
                    "id",
                    "poll",
                    "detail_type",
                    "label",
                    "hint",
                    "priority",
                    "required")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(poll));
        stmt.setInt(3, type.ordinal());
        stmt.setString(4, label);
        stmt.setString(5, hint);
        stmt.setInt(6, priority);
        stmt.setBoolean(7, required);
        stmt.executeUpdate();
      }

    } finally {
      YasssCore.getDB().close(null, stmt, null);
    }
  }

  /**
   * Removes this {@link PollDetail} from the database, if it exists.
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
                  YasssCore.getDB().getPrefix() + "poll_detail")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * {@inheritDoc}
   */
  @Override public int compareTo(PollDetail detail) {
    Objects.requireNonNull(detail);
    int c;
    if(0 != (c = Integer.compare(priority, detail.priority))) return c;
    if(0 != (c = label.compareToIgnoreCase(detail.label))) return c;
    // As in Detail: these collect into a TreeSet, so two questions sharing a
    // label would otherwise collapse into one on read. Asking the same question
    // twice is unusual but legal, and losing the second silently is not.
    return Activity.compareIDs(getID(), detail.getID());
  }
}
