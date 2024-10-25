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

/**
 * A {@link ConcurrentLinkedDeque} that maintains a fixed maximum number of
 * elements. When more elements than the maximum count are added, the other end
 * of the dequeue is cleared to make room.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class ConcurrentLinkedEvictionDeque<E> extends ConcurrentLinkedDeque<E> {

  private final int capacity;

  /**
   * Instantiates an empty {@link ConcurrentLinkedEvictionDeque} with a fixed cap.
   *
   * @param capacity the maximum number of elements permitted in this queue
   *        before rotation takes place
   */
  public ConcurrentLinkedEvictionDeque(int capacity) {
    super();
    this.capacity = capacity;
  }

  /**
   * Instantiates a {@link ConcurrentLinkedEvictionDeque} with the elements of
   * another {@link Collection}. The cap of the {@link ConcurrentLinkedEvictionDeque}
   * is set to the size of the provided collection.
   *
   * Note that the collection's class must implement a deterministic order in
   * order for this constructure to also be deterministic.
   *
   * @param collection the source collection
   */
  public ConcurrentLinkedEvictionDeque(Collection<? extends E> collection) {
    super(collection);
    this.capacity = collection.size();
  }

  /**
   * Instantiates a {@linked ConcurrentLinkedEvictionDeque} with the elements of
   * another {@link Collection}. If the provided collection is larger than the
   * capacity, the inserted collection is truncated accordingly such that the
   * later elements are prioritized over the earlier elements.
   *
   * Note that the collection's class must implement a deterministic order in
   * order for this constructor to also be deterministic.
   *
   * @param capacity the maximum number of elements permitted in this queue before
   *        rotation takes place
   * @param collection the source collection
   */
  public ConcurrentLinkedEvictionDeque(int capacity, Collection<? extends E> collection) {
    super(collection);
    this.capacity = capacity;
    evictHead();
  }

  /**
   * {@inheritDoc}
   */
  @Override public synchronized boolean add(E entry) {
    var ret = super.add(entry);
    evictHead();
    return ret;
  }

  /**
   * {@inheritDoc}
   */
  @Override public synchronized boolean addAll(Collection<? extends E> collection) {
    var ret = super.addAll(collection);
    evictHead();
    return ret;
  }

  /**
   * {@inheritDoc}
   */
  @Override public synchronized void addFirst(E entry) {
    super.addFirst(entry);
    evictTail();
  }

  /**
   * {@inheritDoc}
   */
  @Override public synchronized void addLast(E entry) {
    super.addLast(entry);
    evictHead();
  }

  /**
   * {@inheritDoc}
   */
  @Override public synchronized boolean offer(E entry) {
    var ret = super.offer(entry);
    evictHead();
    return ret;
  }

  /**
   * {@inheritDoc}
   */
  @Override public synchronized boolean offerFirst(E entry) {
    var ret = super.offerFirst(entry);
    evictTail();
    return ret;
  }

  /**
   * {@inheritDoc}
   */
  @Override public synchronized boolean offerLast(E entry) {
    var ret = super.offerLast(entry);
    evictHead();
    return ret;
  }

  /**
   * {@inheritDoc}
   */
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
