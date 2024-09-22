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
import java.util.Objects;
import java.util.UUID;

public class Activity implements Comparable<Activity> {

  public static Activity getActivity(UUID activityID) throws SQLException {
    return null;
  }

  private final UUID event;
  
  private UUID id = null;
  private String shortDescription = null;
  private String longDescription = null;
  private int maxActivityVolunteers = -1;
  private int maxSlotVolunteersDefault = -1;
  private int priority = 0;

  public Activity(UUID event) {
    this.event = event;
  }

  public UUID getID() {
    return id;
  }

  public UUID getEvent() {
    return event;
  }

  public String getShortDescription() {
    return shortDescription;
  }

  public Activity setShortDescription(String shortDescription) {
    this.shortDescription = shortDescription;
    return this;
  }

  public String getLongDescrpition() {
    return longDescription;
  }

  public Activity setLongDescription(String longDescription) {
    this.longDescription = longDescription;
    return this;
  }

  public int getMaxActivityVolunteers() {
    return maxActivityVolunteers;
  }

  public Activity setMaxActivityVolunteers(int maxVolunteers) {
    this.maxActivityVolunteers = maxVolunteers;
    return this;
  }

  public int getMaxSlotVolunteersDefault() {
    return maxSlotVolunteersDefault;
  }

  public Activity setMaxSlotVolunteersDefault(int maxVolunteers) {
    this.maxSlotVolunteersDefault = maxVolunteers;
    return this;
  }

  public int getPriority() {
    return priority;
  }

  public Activity setPriority(int priority) {
    this.priority = priority;
    return this;
  }

  public List<Slot> getSlots() throws SQLException {
    return null;
  }

  public Slot getSlot(UUID window) throws SQLException {
    return null;
  }

  public void commit() throws SQLException {
  }

  public void delete() throws SQLException {
  }

  @Override public int compareTo(Activity activity) {
    Objects.requireNonNull(activity);
    int c;
    return 0 == (c = Integer.compare(priority, activity.priority))
      ? shortDescription.compareToIgnoreCase(activity.shortDescription)
      : c;
  }

}
