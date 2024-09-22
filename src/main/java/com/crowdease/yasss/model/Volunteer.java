/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class Volunteer {

  public static Volunteer getVolunteer(UUID volunteerID) throws SQLException {
    return null;
  }

  private final UUID event;

  private UUID id;
  private UUID user;
  private Map<Detail, String> details = new HashMap<>();
  private boolean remindersEnabled;

  public Volunteer(UUID id, UUID user, UUID event) {
    this.id = id;
    this.user = user;
    this.event = event;
  }

  public UUID getID() {
    return id;
  }

  public UUID getEvent() {
    return event;
  }

  public UUID getUser() {
    return user;
  }

  public Volunteer setUser(UUID user) {
    this.user = user;
    return this;
  }
  
  public Map<Detail, String> getDetails() {
    return Map.copyOf(details);
  }

  public Volunteer setDetails(Map<Detail, String> details) {
    this.details = Map.copyOf(details);
    return this;
  }

  public boolean remindersEnabled() {
    return remindersEnabled;
  }

  public Volunteer enableReminders(boolean enabled) {
    this.remindersEnabled = enabled;
    return this;
  }

  public void commit() throws SQLException {
  }

  public void delete() throws SQLException {
  }
  
}
