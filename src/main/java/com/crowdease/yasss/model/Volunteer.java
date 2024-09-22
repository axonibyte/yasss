/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class Volunteer {

  private final UUID activity;
  private final UUID window;

  private UUID user;
  private Map<Detail, String> details = new HashMap<>();
  private boolean remindersEnabled;

  public Volunteer(UUID activity, UUID window) {
    this.activity = activity;
    this.window = window;
  }

  public UUID getActivity() {
    return activity;
  }

  public UUID getWindow() {
    return window;
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
  
}
