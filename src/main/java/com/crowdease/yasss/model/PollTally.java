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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import com.crowdease.yasss.YasssCore;

/**
 * How the votes are going: one number per square.
 *
 * <p>Counted in the database rather than by walking every {@link PollResponse}
 * in Java. The counterpart on the event side, {@link VolunteerSummary}, has to
 * assemble whole volunteers because the sign-in sheet names them; a poll's grid
 * needs only a number per square, and a poll with two hundred answers should
 * not load two hundred objects to render six integers.
 *
 * <p>Whether these numbers may be shown to a given caller is
 * {@link Poll#tallyVisible} and is decided before this is ever called. Nothing
 * here filters: a class that sometimes returns partial counts would be
 * impossible to reason about at the call site.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public final class PollTally {

  private PollTally() { }

  /**
   * Counts the votes cast on each of a poll's squares.
   *
   * <p>Squares with no votes are absent from the map rather than present with
   * zero: the caller holds the full set of squares already, and reporting the
   * absence of a vote is the caller's job, not a query's.
   *
   * @param pollID the {@link UUID} of the {@link Poll}
   * @return a map of {@link PollCell} {@link UUID} to vote count
   * @throws SQLException if a database malfunction occurs
   */
  public static Map<UUID, Integer> counts(UUID pollID) throws SQLException {
    Map<UUID, Integer> counts = new LinkedHashMap<>();
    if(null == pollID) return counts;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      // Hand-built: this is a three-table join with a GROUP BY and an aggregate
      // alias, which SQLBuilder would express less clearly than SQL does.
      stmt = con.prepareStatement(
          "SELECT v.cell AS cell, COUNT(v.response) AS vote_count"
              + " FROM " + YasssCore.getDB().getPrefix() + "poll_vote v"
              + " INNER JOIN " + YasssCore.getDB().getPrefix() + "poll_cell c"
              + " ON v.cell = c.id"
              + " INNER JOIN " + YasssCore.getDB().getPrefix() + "poll_option o"
              + " ON c.poll_option = o.id"
              + " WHERE o.poll = ?"
              + " GROUP BY v.cell");
      stmt.setBytes(1, com.axonibyte.lib.db.SQLBuilder.uuidToBytes(pollID));
      res = stmt.executeQuery();

      while(res.next())
        counts.put(
            com.axonibyte.lib.db.SQLBuilder.bytesToUUID(
                res.getBytes("cell")),
            res.getInt("vote_count"));
      return counts;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Counts how many people have answered a poll at all.
   *
   * <p>Distinct from the largest per-square count: somebody may answer and
   * choose nothing, which is itself a meaningful reply -- "none of these work
   * for me" -- and a denominator that ignored them would overstate how well the
   * best square did.
   *
   * @param pollID the {@link UUID} of the {@link Poll}
   * @return the number of answers on record
   * @throws SQLException if a database malfunction occurs
   */
  public static int respondents(UUID pollID) throws SQLException {
    if(null == pollID) return 0;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          "SELECT COUNT(id) AS response_count FROM "
              + YasssCore.getDB().getPrefix() + "poll_response WHERE poll = ?");
      stmt.setBytes(1, com.axonibyte.lib.db.SQLBuilder.uuidToBytes(pollID));
      res = stmt.executeQuery();
      res.next();
      return res.getInt("response_count");

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }
}
