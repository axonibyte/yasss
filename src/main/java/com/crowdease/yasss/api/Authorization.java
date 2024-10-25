/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import com.axonibyte.lib.http.rest.AuthStatus;

/**
 * An authorization token that accompanies the authentication token. Determines
 * the amount of power an authenticated user has to view and/or manipulate resources.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class Authorization implements AuthStatus {

  public static final Object IS_AUTHENTICATED = new Object();
  public static final Object IS_HUMAN = new Object();

  private final boolean isAuthenticated;
  private final boolean isHuman;

  /**
   * Instantiates an {@link Authorization} object.
   *
   * @param isAuthenticated {@code true} iff the user was properly authenticated
   * @param isHuman {@code true} iff the user passed a CAPTCHA check
   */
  Authorization(boolean isAuthenticated, boolean isHuman) {
    this.isAuthenticated = isAuthenticated;
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
      return isAuthenticated;
    
    else if(IS_HUMAN == permission)
      return isHuman;
    
    else return false;
  }

  /**
   * {@inheritDoc}
   */
  @Override public boolean atMost(Object permission) {
    throw new UnsupportedOperationException();
  }
  
}
