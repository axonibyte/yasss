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

public class User extends Credentialed implements Comparable<User> {
  
  public static enum AccessLevel {
    BANNED,
    UNVERIFIED,
    STANDARD,
    ADMIN
  }
  
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
  
  public static User getUser(UUID userID) throws SQLException {
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
  
  public static User getUser(String email) throws SQLException {
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
  
  public User(UUID id, byte[] pubkey, byte[] mfakey, String email, String pendingEmail, AccessLevel accessLevel) {
    super(id, pubkey, null, mfakey);
    this.email = email;
    this.pendingEmail = email;
    this.accessLevel = accessLevel;
  }
  
  public User(String pendingEmail, AccessLevel accessLevel, String pubkey) throws CryptoException {
    super(null, null, null, null);
    this.pendingEmail = email;
    this.accessLevel = accessLevel;
    setPubkey(pubkey);
  }
  
  public String getEmail() {
    return email;
  }
  
  public User setEmail(String email) {
    this.email = email;
    return this;
  }
  
  public String getPendingEmail() {
    return pendingEmail;
  }
  
  public User setPendingEmail(String email) {
    this.pendingEmail = email;
    return this;
  }
  
  public AccessLevel getAccessLevel() {
    return accessLevel;
  }
  
  public User setAccessLevel(AccessLevel accessLevel) {
    this.accessLevel = accessLevel;
    return this;
  }
  
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
  
  @Override public int compareTo(User user) {
    return null == email && null == user.email ? 0
        : null == email ? -1
        : null == user.email ? 1
        : email.compareTo(user.email);
  }
  
}
