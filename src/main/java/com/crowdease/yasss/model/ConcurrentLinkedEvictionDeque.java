/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.util.Collection;
import java.util.concurrent.ConcurrentLinkedDeque;

public class ConcurrentLinkedEvictionDeque<E> extends ConcurrentLinkedDeque<E> {

  private final int capacity;

  public ConcurrentLinkedEvictionDeque(int capacity) {
    super();
    this.capacity = capacity;
  }

  public ConcurrentLinkedEvictionDeque(Collection<? extends E> collection) {
    super(collection);
    this.capacity = collection.size();
  }

  public ConcurrentLinkedEvictionDeque(int capacity, Collection<? extends E> collection) {
    super(collection);
    this.capacity = capacity;
    evictHead();
  }

  @Override public synchronized boolean add(E entry) {
    var ret = super.add(entry);
    evictHead();
    return ret;
  }

  @Override public synchronized boolean addAll(Collection<? extends E> collection) {
    var ret = super.addAll(collection);
    evictHead();
    return ret;
  }

  @Override public synchronized void addFirst(E entry) {
    super.addFirst(entry);
    evictTail();
  }

  @Override public synchronized void addLast(E entry) {
    super.addLast(entry);
    evictHead();
  }

  @Override public synchronized boolean offer(E entry) {
    var ret = super.offer(entry);
    evictHead();
    return ret;
  }

  @Override public synchronized boolean offerFirst(E entry) {
    var ret = super.offerFirst(entry);
    evictTail();
    return ret;
  }

  @Override public synchronized boolean offerLast(E entry) {
    var ret = super.offerLast(entry);
    evictHead();
    return ret;
  }

  @Override public synchronized void push(E entry) {
    super.push(entry);
    evictTail();
  }

  private void evictHead() {
    while(capacity < size())
      poll();
  }

  private void evictTail() {
    while(capacity < size())
      pop();
  }
  
}
