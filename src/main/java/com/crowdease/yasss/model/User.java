/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.SQLException;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.auth.CryptoException;

public class User extends Credentialed {
  
  public static enum AccessLevel {
    BANNED,
    UNVERIFIED,
    STANDARD,
    ADMIN
  }

  public static Set<User> getUsers(AccessLevel level, Integer page, Integer limit) throws SQLException {
    return null;
  }

  public static int countUsers(AccessLevel level) throws SQLException {
    return 0;
  }

  public static User getUser(UUID userID) throws SQLException {
    return null;
  }

  public static User getUser(String email) throws SQLException {
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
  
  public User(String email, AccessLevel accessLevel, String pubkey) throws CryptoException {
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
  }

  public void delete() throws SQLException {
  }
  
}
