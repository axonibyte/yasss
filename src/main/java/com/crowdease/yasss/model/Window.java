/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.time.ZonedDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public class Window implements Comparable<Window> {

  public static Window getWindow(UUID windowID) {
    return null;
  }

  private final UUID event;
  
  private UUID id = null;
  private ZonedDateTime begin = null;
  private ZonedDateTime end = null;

  public Window(UUID event) {
    this.event = event;
  }

  public UUID getID() {
    return id;
  }

  public UUID getEvent() {
    return event;
  }

  public ZonedDateTime getBeginTime() {
    return begin;
  }

  public Window setBeginTime(ZonedDateTime beginTime) {
    this.begin = beginTime;
    return this;
  }

  public ZonedDateTime getEndTime() {
    return end;
  }

  public Window setEndTime(ZonedDateTime endTime) {
    this.end = endTime;
    return this;
  }

  public List<Slot> getSlots() {
    return null;
  }

  public void commit() {
  }

  public void delete() {
  }

  @Override public int compareTo(Window window) {
    Objects.requireNonNull(window);
    int c;
    return 0 == (c = compareTimes(begin, window.end))
      ? compareTimes(end, window.end)
      : c;
  }

  private int compareTimes(ZonedDateTime a, ZonedDateTime b) {
    return null == a ? (null == b ? 0 : 1) : (null == b ? -1 : a.compareTo(b));    
  }
  
}
