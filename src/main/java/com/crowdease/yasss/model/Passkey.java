/*
 * Copyright (c) 2026 CrowdEase, LLC.
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
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;

/**
 * An enrolled WebAuthn credential.
 *
 * @author Caleb L. Power
 */
public final class Passkey {

  /** The most credential id bytes that fit the column. */
  public static final int MAX_CREDENTIAL_ID_BYTES = 255;

  private final UUID id;
  private final UUID user;
  private final byte[] credentialID;
  private final byte[] publicKey;
  private final String rpID;
  private final long signCount;
  private final String transports;
  private final byte[] aaguid;
  private final String label;
  private final boolean backupEligible;
  private final boolean backupState;
  private final long createdAt;
  private final Long lastUsed;

  /** Full constructor; see the accessors for what each field means. */
  public Passkey(
      UUID id, UUID user, byte[] credentialID, byte[] publicKey, String rpID, long signCount,
      String transports, byte[] aaguid, String label, boolean backupEligible,
      boolean backupState, long createdAt, Long lastUsed) {
    this.id = id;
    this.user = user;
    this.credentialID = credentialID;
    this.publicKey = publicKey;
    this.rpID = rpID;
    this.signCount = signCount;
    this.transports = transports;
    this.aaguid = aaguid;
    this.label = label;
    this.backupEligible = backupEligible;
    this.backupState = backupState;
    this.createdAt = createdAt;
    this.lastUsed = lastUsed;
  }

  /** @return this credential's own identifier, which is not the WebAuthn credential id */
  public UUID getID() {
    return id;
  }

  /** @return the account this belongs to */
  public UUID getUser() {
    return user;
  }

  /** @return the WebAuthn credential id, as the authenticator emitted it */
  public byte[] getCredentialID() {
    return credentialID.clone();
  }

  /** @return the COSE-encoded public key */
  public byte[] getPublicKey() {
    return publicKey.clone();
  }

  /** @return the relying party this was enrolled under */
  public String getRpID() {
    return rpID;
  }

  /** @return the last signature counter this credential reported */
  public long getSignCount() {
    return signCount;
  }

  /** @return the transports the authenticator advertised, comma-separated, or null */
  public String getTransports() {
    return transports;
  }

  /** @return the authenticator model identifier, or null */
  public byte[] getAAGUID() {
    return null == aaguid ? null : aaguid.clone();
  }

  /** @return a human-chosen name, or null */
  public String getLabel() {
    return label;
  }

  /**
   * Whether this credential may be backed up, i.e. synced to a cloud.
   *
   * <p>The difference between "safe to turn your password off" and "losing this laptop
   * loses your account", which is why it is stored rather than merely observed.
   *
   * @return the BE flag from the authenticator data
   */
  public boolean isBackupEligible() {
    return backupEligible;
  }

  /** @return the BS flag: whether it currently <em>is</em> backed up */
  public boolean isBackupState() {
    return backupState;
  }

  /** @return when it was enrolled, epoch milliseconds */
  public long getCreatedAt() {
    return createdAt;
  }

  /** @return when it last signed in, epoch milliseconds, or null */
  public Long getLastUsed() {
    return lastUsed;
  }

  /**
   * Whether a reported signature counter is acceptable.
   *
   * <p>The counter detects a cloned authenticator: a genuine one only ever counts up, so a
   * value that did not advance suggests two copies of the same credential.
   *
   * <p><b>Except that most authenticators do not count at all.</b> iCloud Keychain, Google
   * Password Manager and a synced Windows Hello credential all report zero, always,
   * because a credential that exists on several devices has no single counter to advance.
   * So the rule is: if both stored and received are zero, the authenticator does not
   * implement the feature and there is nothing to check; otherwise it must strictly
   * advance.
   *
   * <p>Getting this wrong in the obvious direction — requiring {@code received > stored}
   * unconditionally — refuses every login from most of the user base, because 0 is not
   * greater than 0. The browser tier cannot catch that: a virtual authenticator increments
   * its counter like a hardware key. {@code PasskeyCounterTest} owns this.
   *
   * @param stored the counter recorded at the last successful assertion
   * @param received the counter this assertion reported
   * @return whether to accept it
   */
  public static boolean counterIsAcceptable(long stored, long received) {
    if(0 == stored && 0 == received) return true;
    return received > stored;
  }

  /**
   * Finds a credential by the id the authenticator reports.
   *
   * @param credentialID the WebAuthn credential id
   * @return the credential, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static Passkey byCredentialID(byte[] credentialID) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "SELECT * FROM %1$spasskey WHERE credential_id = ?",
              YasssCore.getDB().getPrefix()));
      stmt.setBytes(1, credentialID);
      res = stmt.executeQuery();
      return res.next() ? fromRow(res) : null;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Every credential enrolled on an account, oldest first.
   *
   * @param user the account
   * @return the credentials; never {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static List<Passkey> byUser(UUID user) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "SELECT * FROM %1$spasskey WHERE user = ? ORDER BY created_at ASC",
              YasssCore.getDB().getPrefix()));
      stmt.setBytes(1, SQLBuilder.uuidToBytes(user));
      res = stmt.executeQuery();

      List<Passkey> out = new ArrayList<>();
      while(res.next()) out.add(fromRow(res));
      return out;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Stores a newly enrolled credential.
   *
   * @throws SQLException if a database malfunction occurs
   */
  public void store() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "INSERT INTO %1$spasskey (id, user, credential_id, public_key, rp_id, "
              + "sign_count, transports, aaguid, label, backup_eligible, backup_state, "
              + "created_at, last_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              YasssCore.getDB().getPrefix()));
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(user));
      stmt.setBytes(3, credentialID);
      stmt.setBytes(4, publicKey);
      stmt.setString(5, rpID);
      stmt.setLong(6, signCount);
      stmt.setString(7, transports);
      stmt.setBytes(8, aaguid);
      stmt.setString(9, label);
      stmt.setBoolean(10, backupEligible);
      stmt.setBoolean(11, backupState);
      stmt.setLong(12, createdAt);
      if(null == lastUsed) stmt.setNull(13, java.sql.Types.BIGINT);
      else stmt.setLong(13, lastUsed);
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Records a successful assertion.
   *
   * <p>The counter predicate is in the {@code WHERE}, so a stale or replayed counter loses
   * the update rather than overwriting a newer one — the same compare-and-swap shape the
   * credential sweep uses, and for the same reason.
   *
   * @param received the counter this assertion reported
   * @param now epoch milliseconds
   * @throws SQLException if a database malfunction occurs
   */
  public void recordUse(long received, long now) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "UPDATE %1$spasskey SET sign_count = ?, last_used = ? "
              + "WHERE id = ? AND sign_count <= ?",
              YasssCore.getDB().getPrefix()));
      stmt.setLong(1, received);
      stmt.setLong(2, now);
      stmt.setBytes(3, SQLBuilder.uuidToBytes(id));
      stmt.setLong(4, received);
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Removes a credential from an account.
   *
   * @param user the account, so one caller cannot delete another's credential
   * @param id the credential to remove
   * @return whether anything was removed
   * @throws SQLException if a database malfunction occurs
   */
  public static boolean remove(UUID user, UUID id) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          String.format(
              "DELETE FROM %1$spasskey WHERE id = ? AND user = ?",
              YasssCore.getDB().getPrefix()));
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.setBytes(2, SQLBuilder.uuidToBytes(user));
      return 0 != stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  private static Passkey fromRow(ResultSet res) throws SQLException {
    Long lastUsed = res.getLong("last_used");
    if(res.wasNull()) lastUsed = null;

    return new Passkey(
        SQLBuilder.bytesToUUID(res.getBytes("id")),
        SQLBuilder.bytesToUUID(res.getBytes("user")),
        res.getBytes("credential_id"),
        res.getBytes("public_key"),
        res.getString("rp_id"),
        res.getLong("sign_count"),
        res.getString("transports"),
        res.getBytes("aaguid"),
        res.getString("label"),
        res.getBoolean("backup_eligible"),
        res.getBoolean("backup_state"),
        res.getLong("created_at"),
        lastUsed);
  }

}
