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
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.Wrapper;
import com.crowdease.yasss.YasssCore;

/**
 * One person's answer to a {@link Poll}.
 *
 * <p>Exactly one row per submission. That is the whole difference between
 * answering a poll and signing up for an event: an event's organiser may add
 * six volunteers in one sitting, and a poll asks one person which times work
 * for them.
 *
 * <h2>The three identity columns</h2>
 *
 * <p>{@code user}, {@code ipAddr} and {@code fingerprint} are all written every
 * time and read selectively. A caller who is signed in is matched on their
 * account alone; a caller who is not is matched on address or fingerprint. The
 * asymmetry is deliberate and is the requirement rather than an oversight: a
 * signed-in respondent is never turned away because somebody else used this
 * browser, but their fingerprint is on record, so answering and then signing
 * out does not buy a second vote.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public class PollResponse {

  private UUID id = null;
  private UUID poll = null;
  private UUID user = null;
  private String name = null;
  private String ipAddr = null;
  private byte[] fingerprint = null;
  private UUID editToken = null;
  private Timestamp submitted = null;
  private Map<PollDetail, String> details = new LinkedHashMap<>();
  private Set<UUID> votes = new LinkedHashSet<>();

  /**
   * Instantiates a {@link PollResponse}.
   *
   * @param id the {@link UUID} of this response, or {@code null} if uncommitted
   * @param poll the {@link UUID} of the {@link Poll} being answered
   * @param user the {@link UUID} of the answering account, or {@code null}
   * @param name the respondent's name
   * @param ipAddr the address the answer arrived from, or {@code null}
   */
  public PollResponse(UUID id, UUID poll, UUID user, String name, String ipAddr) {
    this.id = id;
    this.poll = poll;
    this.user = user;
    this.name = name;
    this.ipAddr = ipAddr;
  }

  /** @return this response's {@link UUID} */
  public UUID getID() {
    return id;
  }

  /** @return the {@link UUID} of the {@link Poll} being answered */
  public UUID getPoll() {
    return poll;
  }

  /** @return the {@link UUID} of the answering account, or {@code null} */
  public UUID getUser() {
    return user;
  }

  /**
   * Sets the answering account.
   *
   * @param user the account's {@link UUID}, or {@code null} if anonymous
   * @return this {@link PollResponse} instance
   */
  public PollResponse setUser(UUID user) {
    this.user = user;
    return this;
  }

  /** @return the respondent's name */
  public String getName() {
    return name;
  }

  /**
   * Sets the respondent's name.
   *
   * @param name the name
   * @return this {@link PollResponse} instance
   */
  public PollResponse setName(String name) {
    this.name = name;
    return this;
  }

  /** @return the address the answer arrived from, or {@code null} */
  public String getUserIP() {
    return ipAddr;
  }

  /**
   * Sets the address the answer arrived from.
   *
   * @param ipAddr the address
   * @return this {@link PollResponse} instance
   */
  public PollResponse setUserIP(String ipAddr) {
    this.ipAddr = ipAddr;
    return this;
  }

  /**
   * Retrieves the salted browser fingerprint recorded with this answer.
   *
   * @return the {@value Fingerprint#BYTE_LENGTH} stored bytes, or {@code null}
   *         if the browser produced no digest
   */
  public byte[] getFingerprint() {
    return fingerprint;
  }

  /**
   * Sets the salted browser fingerprint recorded with this answer.
   *
   * <p>Expects the output of {@link Fingerprint#saltFor}, not the digest the
   * client sent. Storing the raw client digest would make this column joinable
   * across polls, which is the one thing the salt exists to prevent.
   *
   * @param fingerprint the salted bytes, or {@code null}
   * @return this {@link PollResponse} instance
   */
  public PollResponse setFingerprint(byte[] fingerprint) {
    this.fingerprint = fingerprint;
    return this;
  }

  /**
   * Retrieves the token that authorises editing this answer.
   *
   * <p>Handed to an anonymous respondent once, in the response to their
   * submission, and held by their browser thereafter. Deliberately not the
   * address or the fingerprint: everyone behind one NAT shares an address, and
   * an address that authorised an edit would let a stranger rewrite somebody
   * else's answer.
   *
   * @return the edit token, or {@code null}
   */
  public UUID getEditToken() {
    return editToken;
  }

  /**
   * Sets the token that authorises editing this answer.
   *
   * @param editToken the token
   * @return this {@link PollResponse} instance
   */
  public PollResponse setEditToken(UUID editToken) {
    this.editToken = editToken;
    return this;
  }

  /** @return when this answer was submitted */
  public Timestamp getSubmitted() {
    return submitted;
  }

  /**
   * Sets when this answer was submitted.
   *
   * @param submitted the submission {@link Timestamp}
   * @return this {@link PollResponse} instance
   */
  public PollResponse setSubmitted(Timestamp submitted) {
    this.submitted = submitted;
    return this;
  }

  /** @return this respondent's answers to the poll's custom questions */
  public Map<PollDetail, String> getDetails() {
    return details;
  }

  /**
   * Sets this respondent's answers to the poll's custom questions.
   *
   * @param details a map of {@link PollDetail} to answer
   * @return this {@link PollResponse} instance
   */
  public PollResponse setDetails(Map<PollDetail, String> details) {
    this.details.clear();
    if(null != details) this.details.putAll(details);
    return this;
  }

  /** @return the {@link PollCell} {@link UUID}s this respondent voted for */
  public Set<UUID> getVotes() {
    return votes;
  }

  /**
   * Sets the squares this respondent voted for.
   *
   * @param votes the {@link PollCell} {@link UUID}s
   * @return this {@link PollResponse} instance
   */
  public PollResponse setVotes(Set<UUID> votes) {
    this.votes.clear();
    if(null != votes) this.votes.addAll(votes);
    return this;
  }

  /**
   * Retrieves a specific {@link PollResponse} from the database, with its votes
   * and its answers to the poll's questions.
   *
   * @param responseID the {@link UUID} of the response
   * @return the {@link PollResponse}, if it exists, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static PollResponse getResponse(UUID responseID) throws SQLException {
    if(null == responseID) return null;

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    PollResponse response = null;
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_response",
                  "poll",
                  "user",
                  "name",
                  "ip_addr_bin",
                  "fingerprint",
                  "edit_token",
                  "submitted")
              .where("id")
              .wrap(new Wrapper(4, "INET6_NTOA"))
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(responseID));
      res = stmt.executeQuery();

      if(res.next()) response = from(responseID, res);

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    if(null == response) return null;
    response.setVotes(PollVote.getVotes(responseID));
    response.loadDetails();
    return response;
  }

  /**
   * Builds a response from a row that already carries every column.
   *
   * @param responseID the response's {@link UUID}
   * @param res the {@link ResultSet}, positioned on the row
   * @return the {@link PollResponse}, without votes or detail answers
   * @throws SQLException if a database malfunction occurs
   */
  static PollResponse from(UUID responseID, ResultSet res) throws SQLException {
    return new PollResponse(
        responseID,
        SQLBuilder.bytesToUUID(
            res.getBytes("poll")),
        SQLBuilder.bytesToUUID(
            res.getBytes("user")),
        res.getString("name"),
        res.getString("ip_addr_bin"))
        .setFingerprint(res.getBytes("fingerprint"))
        .setEditToken(
            SQLBuilder.bytesToUUID(
                res.getBytes("edit_token")))
        .setSubmitted(res.getTimestamp("submitted"));
  }

  /**
   * Loads this response's answers to the poll's custom questions.
   *
   * @throws SQLException if a database malfunction occurs
   */
  void loadDetails() throws SQLException {
    details.clear();
    if(null == id) return;

    Map<UUID, PollDetail> fields = new LinkedHashMap<>();
    for(PollDetail field : PollDetail.getDetails(poll))
      fields.put(field.getID(), field);

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "poll_response_detail",
                  "detail_field",
                  "detail_value")
              .where("response")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      res = stmt.executeQuery();

      while(res.next()) {
        PollDetail field = fields.get(
            SQLBuilder.bytesToUUID(
                res.getBytes("detail_field")));
        // A row whose question has since been deleted is skipped rather than
        // mapped under a null key: the cascade removes them, so this only ever
        // fires on a read racing a deletion, and a null key in the map would
        // fail much later and somewhere unrelated.
        if(null != field) details.put(field, res.getString("detail_value"));
      }

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Saves this {@link PollResponse}, its votes and its answers to the database.
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
   * Saves this {@link PollResponse} on a caller-supplied connection.
   *
   * <p>The connection is the caller's and is deliberately not closed here. The
   * duplicate check that guards a single-answer poll counts rows on this table
   * while holding the poll's row lock, so the count and this insert have to be
   * one transaction or the check is decorative.
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
                    YasssCore.getDB().getPrefix() + "poll_response",
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
                  YasssCore.getDB().getPrefix() + "poll_response",
                  "poll",
                  "user",
                  "name",
                  "ip_addr_bin",
                  "fingerprint",
                  "edit_token",
                  "submitted")
              .where("id")
              .wrap(new Wrapper(4, "INET6_ATON"))
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(poll));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(user));
      stmt.setString(3, name);
      stmt.setString(4, ipAddr);
      stmt.setBytes(5, fingerprint);
      stmt.setBytes(6, SQLBuilder.uuidToBytes(editToken));
      stmt.setTimestamp(7, submitted);
      stmt.setBytes(8, SQLBuilder.uuidToBytes(id));

      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "poll_response",
                    "id",
                    "poll",
                    "user",
                    "name",
                    "ip_addr_bin",
                    "fingerprint",
                    "edit_token",
                    "submitted")
                .wrap(new Wrapper(5, "INET6_ATON"))
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(poll));
        stmt.setBytes(3, SQLBuilder.uuidToBytes(user));
        stmt.setString(4, name);
        stmt.setString(5, ipAddr);
        stmt.setBytes(6, fingerprint);
        stmt.setBytes(7, SQLBuilder.uuidToBytes(editToken));
        stmt.setTimestamp(8, submitted);
        stmt.executeUpdate();
      }

      YasssCore.getDB().close(null, stmt, null);
      stmt = null;

      commitDetails(con);
      PollVote.replaceWithin(con, id, votes);

    } finally {
      YasssCore.getDB().close(null, stmt, null);
    }
  }

  /**
   * Rewrites this response's answers to the poll's questions.
   *
   * <p>Delete-then-insert, where {@link Volunteer} does update-then-insert of
   * the rows that were missing. The shapes differ because the submissions do:
   * an event's volunteer is edited field by field over time, while a poll answer
   * arrives whole and replaces whatever was there. Wiping first is the honest
   * expression of that, and it also removes an answer to a question the
   * respondent has since cleared -- which the update-shaped version leaves
   * behind.
   *
   * @param con the {@link Connection} running the transaction
   * @throws SQLException if a database malfunction occurs
   */
  private void commitDetails(Connection con) throws SQLException {
    PreparedStatement stmt = null;

    try {
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "poll_response_detail")
              .where("response")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.executeUpdate();
      YasssCore.getDB().close(null, stmt, null);
      stmt = null;

      if(details.isEmpty()) return;

      stmt = con.prepareStatement(
          new SQLBuilder()
              .insert(
                  YasssCore.getDB().getPrefix() + "poll_response_detail",
                  "response",
                  "detail_field",
                  "detail_value")
              .toString());
      for(var answer : details.entrySet()) {
        if(null == answer.getKey() || null == answer.getKey().getID()) continue;
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(answer.getKey().getID()));
        stmt.setString(3, null == answer.getValue() ? "" : answer.getValue());
        stmt.addBatch();
      }
      stmt.executeBatch();

    } finally {
      YasssCore.getDB().close(null, stmt, null);
    }
  }

  /**
   * Removes this {@link PollResponse} from the database, if it exists.
   *
   * <p>Its votes and answers go with it, by cascade.
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
                  YasssCore.getDB().getPrefix() + "poll_response")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
}
