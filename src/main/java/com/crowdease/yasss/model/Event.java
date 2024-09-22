/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

public class Event {

  public static Event getEvent(UUID eventID) throws SQLException {
    return null;
  }

  private UUID id = null;
  private UUID admin = null;
  private String shortDescription = null;
  private String longDescription = null;
  private long firstDraftTimestamp = -1L;
  private boolean isPublished = false;
  private boolean emailOnSubmission = false;
  private boolean allowMultiUserSignups = false;

  public UUID getID() {
    return id;
  }

  public UUID getAdmin() {
    return admin;
  }

  public Event setAdmin(UUID admin) {
    this.admin = admin;
    return this;
  }

  public String getShortDescription() {
    return shortDescription;
  }

  public Event setShortDescription(String shortDescription) {
    this.shortDescription = shortDescription;
    return this;
  }

  public String getLongDescription() {
    return longDescription;
  }

  public Event setLongDescription(String longDescription) {
    this.longDescription = longDescription;
    return this;
  }

  public long getFirstDraftTimestamp() {
    return firstDraftTimestamp;
  }

  public Event setFirstDraftTimestamp(long timestamp) {
    this.firstDraftTimestamp = timestamp;
    return this;
  }

  public boolean isPublished() {
    return isPublished;
  }

  public Event setPublished(boolean published) {
    this.isPublished = published;
    return this;
  }

  public boolean emailOnSubmissionEnabled() {
    return emailOnSubmission;
  }

  public Event enableEmailOnSubmission(boolean enabled) {
    this.emailOnSubmission = enabled;
    return this;
  }

  public boolean allowMultiUserSignups() {
    return allowMultiUserSignups;
  }

  public Event allowMultiUserSignups(boolean allow) {
    this.allowMultiUserSignups = allow;
    return this;
  }

  public List<Activity> getActivities() throws SQLException {
    return null;
  }

  public List<Window> getWindows() throws SQLException {
    return null;
  }

  public void commit() throws SQLException {
  }

  public void delete() throws SQLException {
  }
}
