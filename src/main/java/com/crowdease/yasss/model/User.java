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
            "id",
            "pubkey",
            "mfakey",
            "email",
            "pending_email",
            "access_level");
    
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
            new User(
                SQLBuilder.bytesToUUID(res.getBytes("id")),
                res.getBytes("pubkey"),
                res.getBytes("mfakey"),
                res.getString("email"),
                res.getString("pending_email"),
                AccessLevel.values()[res.getInt("access_level")]));
      
      return users;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
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
      
    } catch(SQLException e) {
      throw e;
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
                  "pubkey",
                  "mfakey",
                  "email",
                  "pending_email",
                  "access_level")
              .where("id")
              .limit(1)
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(userID));
      res = stmt.executeQuery();
      
      if(res.next())
        return new User(
            userID,
            res.getBytes("pubkey"),
            res.getBytes("mfakey"),
            res.getString("email"),
            res.getString("pending_email"),
            AccessLevel.values()[res.getInt("access_level")]);
      
    } catch(SQLException e) {
      throw e;
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
                  "id",
                  "pubkey",
                  "mfakey",
                  "email",
                  "pending_email",
                  "access_level")
              .where("email", ComparisonOp.LIKE)
              .order("last_update", Order.DESC)
              .limit(1)
              .toString());
      stmt.setString(1, email);
      res = stmt.executeQuery();
      
      if(res.next())
        return new User(
            SQLBuilder.bytesToUUID(res.getBytes("id")),
            res.getBytes("pubkey"),
            res.getBytes("mfakey"),
            res.getString("email"),
            res.getString("pending_email"),
            AccessLevel.values()[res.getInt("access_level")]);
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
    
    return null;
  }
  
  private String email = null;
  private String pendingEmail = null;
  private AccessLevel accessLevel = AccessLevel.UNVERIFIED;

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
    this.pendingEmail = email;
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
    this.pendingEmail = email;
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
   * Sets the user's pending email address.
   *
   * @param email the user's pending email address
   * @return the {@link User} instance
   */
  public User setPendingEmail(String email) {
    this.pendingEmail = email;
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
                  "access_level")
              .where("id")
              .toString());
      stmt.setBytes(1, getPubkey());
      stmt.setBytes(2, getEncMFASecret());
      stmt.setString(3, email);
      stmt.setString(4, pendingEmail);
      stmt.setInt(5, accessLevel.ordinal());
      stmt.setBytes(6, SQLBuilder.uuidToBytes(getID()));
      
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
                    "access_level")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(getID()));
        stmt.setBytes(2, getPubkey());
        stmt.setBytes(3, getEncMFASecret());
        stmt.setString(4, email);
        stmt.setString(5, pendingEmail);
        stmt.setInt(6, accessLevel.ordinal());
        stmt.executeUpdate();
      }

      if(null != email) {
        // clean up any users with the same pending email
        // first, by deleting pending emails for any user with an existing email
        
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
        
        // then, by outright deleting any users with out an email with that pending
        // email
        
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
      
    } catch(SQLException e) {
      throw e;
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
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * {@inheritDoc}
   */
  @Override public int compareTo(User user) {
    return null == email && null == user.email ? 0
        : null == email ? -1
        : null == user.email ? 1
        : email.compareTo(user.email);
  }
  
}
