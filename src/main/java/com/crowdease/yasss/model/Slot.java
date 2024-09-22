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

public class Slot {

  public static Slot getSlot(UUID activity, UUID window) throws SQLException {
    return null;
  }

  private final UUID activity;
  private final UUID window;
  
  private int maxSlotVolunteers = -1;

  public Slot(UUID activity, UUID window) {
    this.activity = activity;
    this.window = window;
  }

  public Set<Volunteer> getVolunteers() throws SQLException {
    return null;
  }

  public void commit() throws SQLException {
  }

  public void delete() throws SQLException {
  }
  
}
