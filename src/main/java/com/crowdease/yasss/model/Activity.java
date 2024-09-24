/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.SQLException;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public class Activity implements Comparable<Activity> {

  public static Activity getActivity(UUID activityID) throws SQLException {
    return null;
  }
  
  private UUID id = null;
  private UUID event = null;
  private String shortDescription = null;
  private String longDescription = null;
  private int maxActivityVolunteers = -1;
  private int maxSlotVolunteersDefault = -1;
  private int priority = 0;

  public Activity(UUID id, UUID event, String shortDescription, String longDescription,
      int maxActivityVolunteers, int maxSlotVolunteersDefault, int priority) {
    this.id = id;
    this.event = event;
    this.shortDescription = shortDescription;
    this.longDescription = longDescription;
    this.maxActivityVolunteers = maxActivityVolunteers;
    this.maxSlotVolunteersDefault = maxSlotVolunteersDefault;
    this.priority = priority;
  }

  public UUID getID() {
    return id;
  }

  public UUID getEvent() {
    return event;
  }

  public Activity setEvent(UUID event) {
    this.event = event;
    return this;
  }

  public String getShortDescription() {
    return shortDescription;
  }

  public Activity setShortDescription(String shortDescription) {
    this.shortDescription = shortDescription;
    return this;
  }

  public String getLongDescription() {
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

  public Set<Slot> getSlots() throws SQLException {
    return null;
  }

  public Slot getSlot(UUID window) throws SQLException {
    return null;
  }

  public int countRSVPs() throws SQLException {
    return -1;
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
