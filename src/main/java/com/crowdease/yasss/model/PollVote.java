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
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;

/**
 * One respondent saying yes to one square.
 *
 * <p>The counterpart of {@link RSVP}, and much the simpler of the two: a poll
 * square cannot fill up, so none of RSVP's capacity checking, row locking or
 * {@link RSVP.CapacityException} has an analogue here. Writing a vote is
 * writing a row.
 *
 * <p>Static rather than an instance model because a vote has no state beyond
 * the pair it names. Nothing ever holds one and mutates it; answers are
 * replaced wholesale, which is what {@link #replaceWithin} is for.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public final class PollVote {

  private PollVote() { }

  /**
   * Retrieves the squares a response voted for.
   *
   * @param responseID the {@link UUID} of the {@link PollResponse}
   * @return a {@link Set} of {@link PollCell} {@link UUID}s
   * @throws SQLException if a database malfunction occurs
   */
  public static Set<UUID> getVotes(UUID responseID) throws SQLException {
    Connection con = null;
    try {
      con = YasssCore.getDB().connect();
      return getVotes(con, responseID);
    } finally {
      YasssCore.getDB().close(con, null, null);
    }
  }

  /**
   * Retrieves the squares a response voted for, on a caller-supplied connection.
   *
   * <p>The connection is the caller's and is deliberately not closed here.
   *
   * @param con the {@link Connection} to use
   * @param responseID the {@link UUID} of the {@link PollResponse}
   * @return a {@link Set} of {@link PollCell} {@link UUID}s
   * @throws SQLException if a database malfunction occurs
   */
  public static Set<UUID> getVotes(Connection con, UUID responseID) throws SQLException {
    Set<UUID> votes = new LinkedHashSet<>();
    if(null == responseID) return votes;

    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_vote",
                  "cell")
              .where("response")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(responseID));
      res = stmt.executeQuery();

      while(res.next())
        votes.add(
            SQLBuilder.bytesToUUID(
                res.getBytes("cell")));
      return votes;

    } finally {
      YasssCore.getDB().close(null, stmt, res);
    }
  }

  /**
   * Replaces a response's votes with exactly the given set.
   *
   * <p>Delete-then-insert rather than a diff. An answer is submitted whole —
   * there is no per-square toggle endpoint the way there is for an RSVP — so a
   * diff would be extra machinery computing something the caller already knows.
   * Both statements run on the caller's transaction, so a half-applied answer
   * is not reachable.
   *
   * <p>The connection is the caller's and is deliberately not closed here.
   *
   * @param con the {@link Connection} running the transaction
   * @param responseID the {@link UUID} of the {@link PollResponse}
   * @param cellIDs the {@link PollCell} {@link UUID}s being voted for
   * @throws SQLException if a database malfunction occurs
   */
  public static void replaceWithin(Connection con, UUID responseID, Collection<UUID> cellIDs)
      throws SQLException {
    PreparedStatement stmt = null;

    try {
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "poll_vote")
              .where("response")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(responseID));
      stmt.executeUpdate();
      YasssCore.getDB().close(null, stmt, null);
      stmt = null;

      if(null == cellIDs || cellIDs.isEmpty()) return;

      stmt = con.prepareStatement(
          new SQLBuilder()
              .insert(
                  YasssCore.getDB().getPrefix() + "poll_vote",
                  "response",
                  "cell")
              .toString());
      // Deduplicated on the way in. The primary key would reject a repeat, but
      // as a 1062 out of the middle of a batch -- which the caller would have to
      // tell apart from a genuine conflict. A payload naming the same square
      // twice means one vote, and saying so here is cheaper than deciding it in
      // an exception handler.
      for(UUID cellID : new LinkedHashSet<>(cellIDs)) {
        stmt.setBytes(1, SQLBuilder.uuidToBytes(responseID));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(cellID));
        stmt.addBatch();
      }
      stmt.executeBatch();

    } finally {
      YasssCore.getDB().close(null, stmt, null);
    }
  }
}
