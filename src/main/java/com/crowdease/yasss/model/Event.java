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
  private boolean emailOnSubmission = false;
  private boolean allowMultiUserSignups = false;
  private boolean isPublished = false;

  public Event(UUID id, UUID admin, String shortDescription, String longDescription,
               long firstDraftTimestamp, boolean emailOnSubmission,
               boolean allowMultiUserSignups, boolean isPublished) {
    this.id = id;
    this.admin = admin;
    this.shortDescription = shortDescription;
    this.longDescription = longDescription;
    this.firstDraftTimestamp = firstDraftTimestamp;
    this.emailOnSubmission = emailOnSubmission;
    this.allowMultiUserSignups = allowMultiUserSignups;
  }

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

  public boolean isPublished() {
    return isPublished;
  }

  public Event publish(boolean publish) {
    this.isPublished = publish;
    return this;
  }

  public List<Detail> getDetails() throws SQLException {
    return null;
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
