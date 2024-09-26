/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.http.rest.AuthStatus;

public class Authorization implements AuthStatus {

  public static final Object IS_AUTHENTICATED = new Object();
  public static final Object IS_HUMAN = new Object();

  private final Set<UUID> events;
  private final boolean isHuman;

  Authorization(Set<UUID> events, boolean isHuman) {
    this.events = null == events ? new HashSet<>() : events;
    this.isHuman = isHuman;
  }

  /**
   * {@inheritDoc}
   */
  @Override public boolean is(Object permission) {
    throw new UnsupportedOperationException();
  }

  /**
   * {@inheritDoc}
   */
  @Override public boolean atLeast(Object permission) {
    if(IS_AUTHENTICATED == permission)
      return !events.isEmpty();
    
    else if(IS_HUMAN == permission)
      return isHuman;
    
    else if(permission instanceof UUID)
      return events.contains((UUID)permission);
    
    else return false;
  }

  /**
   * {@inheritDoc}
   */
  @Override public boolean atMost(Object permission) {
    throw new UnsupportedOperationException();
  }
  
}
