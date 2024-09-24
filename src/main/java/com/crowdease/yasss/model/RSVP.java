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

public class RSVP {

  private final UUID activity;
  private final UUID window;
  private final UUID volunteer;

  public RSVP(UUID activity, UUID window, UUID volunteer) {
    this.activity = activity;
    this.window = window;
    this.volunteer = volunteer;
  }
  
  public UUID getActivity() {
    return activity;
  }

  public UUID getWindow() {
    return window;
  }

  public UUID getVolunteer() {
    return volunteer;
  }

  public void commit() throws SQLException {
  }

  public void delete() throws SQLException {
  }
  
}
