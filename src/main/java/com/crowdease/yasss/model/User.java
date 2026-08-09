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
import java.sql.Types;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.auth.CryptoException;
import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

/**
 * Represents a user that can authenticate and manage one or more volunteers and
 * their respective RSVPS, and any events that they might administrate.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class User extends Credentialed implements Comparable<User> {

  /**
   * Represents the access that the user has to the platform in general.
   *
   * @author Caleb L. Power <cpower@crowdease.com>
   */
  public static enum AccessLevel {

    /**
     * Indicates that the user is prohibited from using the platform.
     */
    BANNED,

    /**
     * Indicates that the user should verify their email address.
     */
    UNVERIFIED,

    /**
     * Indicates that the user has general access to the system.
     */
    STANDARD,

    /**
     * Indicates that the user has platform-wide administrative access.
     */
    ADMIN
  }

  /**
   * Retrieves the set of users that match a set of specified criteria.
   *
   * @param level the {@link AccessLevel} associated with the {@link User}, or
   *        {@code null} to retrieve users without regard to their respective
   *        access levels
   * @param page the page to retrieve, with respect to previously-established
   *        page limits
   * @param limit the maximum number of records to return
   * @return a {@link Set} of {@link User} objects
   * @throws SQLException if a database malfunction occurs
   */
  public static Set<User> getUsers(AccessLevel level, Integer page, Integer limit) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    SQLBuilder query = new SQLBuilder()
        .select(
            YasssCore.getDB().getPrefix() + "user",
            (Object[])COLUMNS);

    if(null != level)
      query.where("access_level");
    if(null != page)
      query.limit(limit, limit * (page - 1));
    else if(null != limit)
      query.limit(limit);

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(query.toString());
      if(null != level)
        stmt.setInt(1, level.ordinal());
      res = stmt.executeQuery();

      Set<User> users = new TreeSet<>();
      while(res.next())
        users.add(
            fromRow(
                res,
                SQLBuilder.bytesToUUID(res.getBytes("id"))));

      return users;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Every column a {@link User} is built from.
   *
   * <p>Named once because there are three queries that select them and one
   * method that reads them, and a column added to some of those and not the rest
   * is a field that is silently null depending on how the user was fetched.
   */
  private static final String[] COLUMNS = {
    "id",
    "pubkey",
    "mfakey",
    "email",
    "pending_email",
    "access_level",
    "verify_token",
    "verify_token_expires",
    "session_epoch",
    "reset_token",
    "reset_token_expires",
    "password_login_disabled"
  };

  /**
   * Builds a {@link User} from a row of {@link #COLUMNS}.
   *
   * @param res the {@link ResultSet}, positioned on the row
   * @param id the user's {@link UUID}
   * @return the {@link User}
   * @throws SQLException if a database malfunction occurs
   */
  private static User fromRow(ResultSet res, UUID id) throws SQLException {
    return new User(
        id,
        res.getBytes("pubkey"),
        res.getBytes("mfakey"),
        res.getString("email"),
        res.getString("pending_email"),
        accessLevelOf(res.getInt("access_level")))
        .setVerifyToken(
            SQLBuilder.bytesToUUID(res.getBytes("verify_token")))
        .setVerifyTokenExpires(
            nullableLong(res, "verify_token_expires"))
        .setSessionEpoch(res.getLong("session_epoch"))
        .setResetToken(
            SQLBuilder.bytesToUUID(res.getBytes("reset_token")))
        .setResetTokenExpires(
            nullableLong(res, "reset_token_expires"))
        .setPasswordLoginDisabled(res.getBoolean("password_login_disabled"));
  }

  /**
   * Reads a nullable {@code BIGINT}.
   *
   * <p>{@code getLong} answers 0 for SQL NULL, and 0 is a perfectly good epoch
   * millisecond -- the first of January 1970 -- so a token with no deadline
   * would read as one that lapsed decades ago and every emailed link predating
   * migration 022 would come back 410.
   *
   * @param res the {@link ResultSet}
   * @param column the column name
   * @return the value, or {@code null} if the column is NULL
   * @throws SQLException if a database malfunction occurs
   */
  private static Long nullableLong(ResultSet res, String column) throws SQLException {
    long value = res.getLong(column);
    return res.wasNull() ? null : value;
  }

  /**
   * Counts the number of known users in accordance with specified criteria.
   *
   * @param level the {@link AccessLevel} that counted users should have, or
   *        {@code null} to count all users
   * @return the number of users in the database that match the specified criteria
   * @throws SQLException if a database malfunction occurs
   */
  public static int countUsers(AccessLevel level) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    SQLBuilder query = new SQLBuilder()
        .select(
            YasssCore.getDB().getPrefix() + "user")
        .count("*", "user_count");
    
    if(null != level)
      query.where("access_level");
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(query.toString());
      if(null != level)
        stmt.setInt(1, level.ordinal());
      res = stmt.executeQuery();
      
      res.next();
      return res.getInt("user_count");
      
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Retrieves a particular user from the database by their unique identifier.
   *
   * @param userID the {@link UUID} of the {@link User}
   * @return the {@link User}, if it exists; otherwise, {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static User getUser(UUID userID) throws SQLException {
    if(null == userID) return null;
    
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "user",
                  (Object[])COLUMNS)
              .where("id")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(userID));
      res = stmt.executeQuery();

      if(res.next())
        return fromRow(res, userID);

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return null;
  }

  /**
   * Retrieves a particular user from the database by their email address.
   *
   * @param email the user's email address
   * @return the {@link User}, if it exists; otherwise, {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static User getUser(String email) throws SQLException {
    if(null == email) return null;
    
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "user",
                  (Object[])COLUMNS)
              // EQUAL_TO, not LIKE. The argument arrives unvalidated -- for
              // ResetUserEndpoint it is a raw path segment -- so `%` matched
              // every account with an address and, ordered by last_update DESC
              // LIMIT 1, quietly resolved to whichever was touched most
              // recently. `POST /v1/users/%` mailed a reset link to an account
              // the caller could not name.
              .where("email", ComparisonOp.EQUAL_TO)
              .order("last_update", Order.DESC)
              .limit(1)
              .toString());
      stmt.setString(1, email);
      res = stmt.executeQuery();
      
      if(res.next())
        return fromRow(
            res,
            SQLBuilder.bytesToUUID(res.getBytes("id")));

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return null;
  }

  /**
   * Invalidates every session on the platform, for every account.
   *
   * <p>One statement with no {@code WHERE}, which is what makes it immediate:
   * the epoch is read on every authenticated request as part of a query that
   * already happens, so there is nothing to propagate and no cache to wait on.
   *
   * <p>Half of the platform-wide revocation. The other half is wiping the stored
   * signers, which this deliberately does not do -- see
   * {@code RevokeSessionsEndpoint} for why the two go together.
   *
   * @param epoch the watermark, normally the current epoch millisecond
   * @return the number of accounts affected
   * @throws SQLException if a database malfunction occurs
   */
  public static int revokeAllSessions(long epoch) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .update(
                  YasssCore.getDB().getPrefix() + "user",
                  "session_epoch")
              .toString());
      stmt.setLong(1, epoch);
      return stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  private String email = null;
  private String pendingEmail = null;
  private AccessLevel accessLevel = AccessLevel.UNVERIFIED;
  private UUID verifyToken = null;
  private Long verifyTokenExpires = null;
  private UUID resetToken = null;
  private Long resetTokenExpires = null;
  private long sessionEpoch = 0L;
  private boolean passwordLoginDisabled = false;

  /**
   * Instantiates a user. This method is designed to be invoked when retrieving
   * a user from the database.
   *
   * @param id the {@link UUID} of the {@link User}
   * @param pubkey the user's public key (as a byte array)
   * @param mfakey the user's secret MFA key (as a byte array)
   * @param email the user's current email address
   * @param pendingEmail any pending email (unverified) that the user might have
   * @param accessLevel the user's {@link AccessLevel}
   */
  public User(UUID id, byte[] pubkey, byte[] mfakey, String email, String pendingEmail, AccessLevel accessLevel) {
    super(id, pubkey, null, mfakey);
    this.email = email;
    this.pendingEmail = pendingEmail;
    this.accessLevel = accessLevel;
  }

  /**
   * Instantiates a user. This method is designed to be invoked when creating a
   * brand-new user.
   *
   * @param pendingEmail the email address that has not yet been verified
   * @param accessLevel the user's access level
   * @param pubkey the user's public key (as a Base64-encoded string)
   * @throws CryptoException if the provided pubkey had an invalid format
   */
  public User(String pendingEmail, AccessLevel accessLevel, String pubkey) throws CryptoException {
    super(null, null, null, null);
    this.pendingEmail = pendingEmail;
    this.accessLevel = accessLevel;
    setPubkey(pubkey);
  }

  /**
   * Retrieves the user's current (verified) email address.
   *
   * @return the user's email address
   */
  public String getEmail() {
    return email;
  }

  /**
   * Sets the user's current (verified) email address.
   *
   * @param email the user's email address
   * @return the {@link User} instance
   */
  public User setEmail(String email) {
    this.email = email;
    return this;
  }

  /**
   * Retrieves the user's pending (unverified) email address.
   *
   * @return the user's pending email address
   */
  public String getPendingEmail() {
    return pendingEmail;
  }

  /**
   * Retrieves the token carried by this user's verification link.
   *
   * <p>Stored rather than signed by the {@code TicketEngine}: its signers live
   * in an in-memory deque, roll on a roughly fifteen-minute horizon and are
   * lost entirely on restart, so a signed link was dead long before most
   * recipients got round to opening the email.
   *
   * @return the token, or {@code null} if no verification is outstanding
   */
  public UUID getVerifyToken() {
    return verifyToken;
  }

  /**
   * Sets the token carried by this user's verification link.
   *
   * @param verifyToken the token, or {@code null} to clear it
   * @return this {@link User}, for chaining
   */
  public User setVerifyToken(UUID verifyToken) {
    this.verifyToken = verifyToken;
    return this;
  }

  /**
   * Retrieves the moment this user's verification link lapses.
   *
   * @return the epoch millisecond, or {@code null} for a link that does not
   *         expire -- which is every link minted before migration 022
   */
  public Long getVerifyTokenExpires() {
    return verifyTokenExpires;
  }

  /**
   * Sets the moment this user's verification link lapses.
   *
   * @param verifyTokenExpires the epoch millisecond, or {@code null}
   * @return this {@link User}, for chaining
   */
  public User setVerifyTokenExpires(Long verifyTokenExpires) {
    this.verifyTokenExpires = verifyTokenExpires;
    return this;
  }

  /**
   * Retrieves the token carried by this user's credential-reset link.
   *
   * <p>Its own token rather than a share of the verification one: an address
   * change and a password reset can be outstanding at the same time, and their
   * lifetimes differ by an order of magnitude because a stale verification link
   * confirms an address while a stale reset link takes over the account.
   *
   * @return the token, or {@code null} if no reset is outstanding
   */
  public UUID getResetToken() {
    return resetToken;
  }

  /**
   * Sets the token carried by this user's credential-reset link.
   *
   * @param resetToken the token, or {@code null} to clear it
   * @return this {@link User}, for chaining
   */
  public User setResetToken(UUID resetToken) {
    this.resetToken = resetToken;
    return this;
  }

  /**
   * Retrieves the moment this user's reset link lapses.
   *
   * @return the epoch millisecond, or {@code null} for a link that does not
   *         expire
   */
  public Long getResetTokenExpires() {
    return resetTokenExpires;
  }

  /**
   * Sets the moment this user's reset link lapses.
   *
   * @param resetTokenExpires the epoch millisecond, or {@code null}
   * @return this {@link User}, for chaining
   */
  public User setResetTokenExpires(Long resetTokenExpires) {
    this.resetTokenExpires = resetTokenExpires;
    return this;
  }

  /**
   * Retrieves this account's session revocation watermark.
   *
   * <p>Any session that began at or before this moment is refused, whatever its
   * timeouts say. Zero means nothing has ever been revoked.
   *
   * @return the epoch millisecond
   */
  public long getSessionEpoch() {
    return sessionEpoch;
  }

  /**
   * Sets this account's session revocation watermark.
   *
   * <p>Takes effect on the next request the account makes: {@code AuthToken}
   * loads the user row before it does anything else, so there is no window and
   * nothing to invalidate.
   *
   * @param sessionEpoch the epoch millisecond
   * @return this {@link User}, for chaining
   */
  public User setSessionEpoch(long sessionEpoch) {
    this.sessionEpoch = sessionEpoch;
    return this;
  }

  /**
   * Whether this account still accepts a password.
   *
   * <p>The switch that makes passkeys worth having. Until an account can turn its password
   * off, a passkey is an alternative way in and nothing more -- the password remains a
   * thing that can be phished, and the AXB-SIG-REQ credential remains a thing that can be
   * captured.
   *
   * @return {@code true} if password sign-in is refused for this account
   */
  public boolean isPasswordLoginDisabled() {
    return passwordLoginDisabled;
  }

  /**
   * Sets whether this account accepts a password.
   *
   * <p>Turning it on is guarded: see {@code ModifyUserEndpoint}, which refuses unless the
   * account holds enough passkeys to survive losing one. Turning it <em>off</em> is not
   * guarded, and is done unconditionally by {@code ResetUserEndpoint} whenever a new
   * public key is installed -- which is what keeps the switch from being a one-way door.
   *
   * @param passwordLoginDisabled whether to refuse password sign-in
   * @return this user
   */
  public User setPasswordLoginDisabled(boolean passwordLoginDisabled) {
    this.passwordLoginDisabled = passwordLoginDisabled;
    return this;
  }

  /**
   * Whether this account may safely stop accepting a password.
   *
   * <p>Two passkeys, or one that is backed up to a cloud. The point is that losing a single
   * device must not lose the account: a synced credential survives the device, and a second
   * credential survives the first. One device-bound passkey and no password is one dropped
   * phone away from an account nobody can reach.
   *
   * <p>Email recovery exists regardless, but it is a fallback rather than a plan -- and an
   * account gets here only by holding a verified address, since enrollment requires one.
   *
   * @return {@code true} if the password may be turned off
   * @throws SQLException if a database malfunction occurs
   */
  public boolean mayDisablePasswordLogin() throws SQLException {
    var passkeys = Passkey.byUser(getID());
    if(2 <= passkeys.size()) return true;
    return passkeys.stream().anyMatch(Passkey::isBackupEligible);
  }

  public User setPendingEmail(String pendingEmail) {
    this.pendingEmail = pendingEmail;
    return this;
  }

  /**
   * Retrieves this user's access level.
   *
   * @return the user's {@link AccessLevel}
   */
  public AccessLevel getAccessLevel() {
    return accessLevel;
  }

  /**
   * Sets this user's access level.
   *
   * @param accessLevel the user's {@link AccessLevel}
   * @return the {@link User} instance
   */
  public User setAccessLevel(AccessLevel accessLevel) {
    this.accessLevel = accessLevel;
    return this;
  }

  /**
   * Saves this {@link User} to the database. If the user already exists, then
   * it will simply be updated.
   *
   * @throws SQLException if a database malfunction occurs
   */
  public void commit() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    
    if(null == getID()) {
      do {
        setID(UUID.randomUUID());
      } while(null != getUser(getID()));
    }
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .update(
                  YasssCore.getDB().getPrefix() + "user",
                  "pubkey",
                  "mfakey",
                  "email",
                  "pending_email",
                  "access_level",
                  "verify_token",
                  "verify_token_expires",
                  "session_epoch",
                  "reset_token",
                  "reset_token_expires",
                  "password_login_disabled")
              .where("id")
              .toString());
      stmt.setBytes(1, getPubkey());
      stmt.setBytes(2, getEncMFASecret());
      stmt.setString(3, email);
      stmt.setString(4, pendingEmail);
      stmt.setInt(5, accessLevel.ordinal());
      stmt.setBytes(6, SQLBuilder.uuidToBytes(verifyToken));
      setNullableLong(stmt, 7, verifyTokenExpires);
      stmt.setLong(8, sessionEpoch);
      stmt.setBytes(9, SQLBuilder.uuidToBytes(resetToken));
      setNullableLong(stmt, 10, resetTokenExpires);
      stmt.setBoolean(11, passwordLoginDisabled);
      // Index 12, not 11. Adding a column shifts the WHERE bind, and getting that wrong
      // writes a UUID into password_login_disabled with no exception -- which is why
      // UserColumnBindingTest asserts the count against COLUMNS.
      stmt.setBytes(12, SQLBuilder.uuidToBytes(getID()));

      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "user",
                    "id",
                    "pubkey",
                    "mfakey",
                    "email",
                    "pending_email",
                    "access_level",
                    "verify_token",
                    "verify_token_expires",
                    "session_epoch",
                    "reset_token",
                    "reset_token_expires",
                    "password_login_disabled")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(getID()));
        stmt.setBytes(2, getPubkey());
        stmt.setBytes(3, getEncMFASecret());
        stmt.setString(4, email);
        stmt.setString(5, pendingEmail);
        stmt.setInt(6, accessLevel.ordinal());
        stmt.setBytes(7, SQLBuilder.uuidToBytes(verifyToken));
        setNullableLong(stmt, 8, verifyTokenExpires);
        stmt.setLong(9, sessionEpoch);
        stmt.setBytes(10, SQLBuilder.uuidToBytes(resetToken));
        setNullableLong(stmt, 11, resetTokenExpires);
        stmt.setBoolean(12, passwordLoginDisabled);
        stmt.executeUpdate();
      }

      if(null != email) {
        // clean up any users with the same pending email
        // first, set any pending email matching this user's email to null if
        // their owners already have verified email addresses
        
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .update(
                    YasssCore.getDB().getPrefix() + "user",
                    "pending_email")
                .where("email", ComparisonOp.IS_NOT_NULL)
                .where("pending_email", ComparisonOp.EQUAL_TO)
                .toString());
        stmt.setNull(1, Types.VARCHAR);
        stmt.setString(2, email);
        stmt.executeUpdate();
        
        // then, by outright deleting any users with a pending email matching
        // this user's email address that don't otherwise have a verified email
        
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .delete(
                    YasssCore.getDB().getPrefix() + "user")
                .where("email", ComparisonOp.IS_NULL)
                .where("pending_email", ComparisonOp.EQUAL_TO)
                .toString());
        stmt.setString(1, email);
        stmt.executeUpdate();
      }
      
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Removes this {@link User} from the database.
   *
   * @throws SQLException if a database malfunction occurs
   */
  public void delete() throws SQLException {
    if(null == getID()) return;
    
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "user")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(getID()));
      stmt.executeUpdate();
      
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * {@inheritDoc}
   */
  @Override public int compareTo(User user) {
    int c = null == email && null == user.email ? 0
        : null == email ? -1
        : null == user.email ? 1
        : email.compareTo(user.email);
    if(0 != c) return c;
    // `ListUsersEndpoint` collects into a TreeSet, so without this every
    // account that has not yet set an address compared equal to every other and
    // the whole lot came back as a single row. The same applied to any two
    // accounts sharing an address -- which the create and modify endpoints
    // refuse, but a direct database edit does not.
    return Activity.compareIDs(getID(), user.getID());
  }
  

  /**
   * Resolves an {@code access_level} column into an {@link AccessLevel}.
   *
   * <p>The column is a {@code TINYINT UNSIGNED} and was read straight into
   * {@code values()[...]}, so anything outside the enum -- a direct database
   * edit, a restored backup from a future schema, a shrunk enum -- threw
   * {@link ArrayIndexOutOfBoundsException} from inside a model getter, which no
   * endpoint catches. {@code Volunteer.ReminderState.fromOrdinal} is the pattern
   * this follows.
   *
   * <p>Out of range resolves to {@link AccessLevel#BANNED}: an unreadable access
   * level should grant nothing, not everything.
   *
   * @param ordinal the stored ordinal
   * @return the {@link AccessLevel}
   */
  /**
   * Binds a nullable {@code BIGINT}.
   *
   * @param stmt the {@link PreparedStatement}
   * @param index the parameter index
   * @param value the value, or {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  private static void setNullableLong(PreparedStatement stmt, int index, Long value)
      throws SQLException {
    if(null == value) stmt.setNull(index, Types.BIGINT);
    else stmt.setLong(index, value);
  }

  static AccessLevel accessLevelOf(int ordinal) {
    AccessLevel[] values = AccessLevel.values();
    return 0 <= ordinal && ordinal < values.length ? values[ordinal] : AccessLevel.BANNED;
  }
}
