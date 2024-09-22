/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.SQLException;
import java.util.UUID;

public class User {

  public static enum AccessLevel {
    BANNED,
    UNVERIFIED,
    STANDARD,
    ADMIN
  }

  public static User getUser(UUID userID) throws SQLException {
    return null;
  }

  public static User getUser(String email) throws SQLException {
    return null;
  }

  private UUID id = null;
  private String email = null;
  private AccessLevel accessLevel = AccessLevel.UNVERIFIED;

  public UUID getID() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public User setEmail(String email) {
    this.email = email;
    return this;
  }

  public AccessLevel getAccessLevel() {
    return accessLevel;
  }

  public User setAccessLevel(AccessLevel accessLevel) {
    this.accessLevel = accessLevel;
    return this;
  }

  
  
}
