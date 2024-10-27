/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import com.axonibyte.lib.http.rest.AuthStatus;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.User.AccessLevel;

/**
 * An authorization token that accompanies the authentication token. Determines
 * the amount of power an authenticated user has to view and/or manipulate resources.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class Authorization implements AuthStatus {

  public static final Object IS_AUTHENTICATED = new Object();
  public static final Object IS_HUMAN = new Object();

  private final boolean isHuman;
  private final User user;

  /**
   * Instantiates an {@link Authorization} object.
   *
   * @param user the authenticated {@link User}, or {@code null} if the actor
   *        did not authenticate
   * @param isHuman {@code true} iff the user passed a CAPTCHA check
   */
  Authorization(User user, boolean isHuman) {
    this.user = user;
    this.isHuman = isHuman;
  }

  /**
   * {@inheritDoc}
   */
  @Override public boolean is(Object permission) {
    if(null != permission && permission instanceof AccessLevel)
      return null != user
        && ((AccessLevel)permission).ordinal() == user.getAccessLevel().ordinal();

    else return atLeast(permission);
  }

  /**
   * {@inheritDoc}
   */
  @Override public boolean atLeast(Object permission) {
    if(!YasssCore.authRequired())
      return true;
    
    else if(null == permission)
      return atLeast(AccessLevel.ADMIN);
    
    else if(IS_AUTHENTICATED == permission)
      return null != user;
    
    else if(IS_HUMAN == permission)
      return isHuman;

    else if(permission instanceof AccessLevel)
      return null != user
        && ((AccessLevel)permission).ordinal() >= user.getAccessLevel().ordinal();

    else if(permission instanceof Event)
      return null != user && (
          user.getID().equals(((Event)permission).getAdmin())
          && atLeast(AccessLevel.STANDARD)
          || atLeast(AccessLevel.ADMIN));

    else if(permission instanceof User)
      return null != user && (
          user.getID().equals(((User)permission).getID())
          && atLeast(AccessLevel.STANDARD)
          || atLeast(AccessLevel.ADMIN));
    
    else return false;
  }

  /**
   * {@inheritDoc}
   */
  @Override public boolean atMost(Object permission) {
    throw new UnsupportedOperationException();
  }

  /**
   * Retrieves the authenticated user, if a user was indeed authenticated.
   *
   * @return the {@link User} if one was authenticated; otherwise, {@code null}
   */
  public User getUser() {
    return user;
  }
  
}
