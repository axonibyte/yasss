/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.Timestamp;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public class Window implements Comparable<Window> {

  public static Window getWindow(UUID windowID) {
    return null;
  }
  
  private UUID id = null;
  private UUID event = null;
  private Timestamp begin = null;
  private Timestamp end = null;

  public Window(UUID id, UUID event, Timestamp begin, Timestamp end) {
    this.id = id;
    this.event = event;
    this.begin = begin;
    this.end = end;
  }

  public UUID getID() {
    return id;
  }

  public UUID getEvent() {
    return event;
  }

  public Window setEvent(UUID event) {
    this.event = event;
    return this;
  }

  public Timestamp getBeginTime() {
    return begin;
  }

  public Window setBeginTime(Timestamp beginTime) {
    this.begin = beginTime;
    return this;
  }

  public Timestamp getEndTime() {
    return end;
  }

  public Window setEndTime(Timestamp endTime) {
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

  private int compareTimes(Timestamp a, Timestamp b) {
    return null == a ? (null == b ? 0 : 1) : (null == b ? -1 : a.compareTo(b));    
  }
  
}
