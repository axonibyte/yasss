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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * An authorization token that accompanies the authentication token. Determines
 * the amount of power an authenticated user has to view and/or manipulate resources.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class Authorization implements AuthStatus {

  public static final Object IS_AUTHENTICATED = new Object();
  public static final Object IS_HUMAN = new Object();

  private static final Logger logger = LoggerFactory.getLogger(Authorization.class);
  
  private final boolean isHuman;
  private final User actor;

  /**
   * Instantiates an {@link Authorization} object.
   *
   * @param actor the authenticated {@link User}, or {@code null} if the actor
   *        did not authenticate
   * @param isHuman {@code true} iff the user passed a CAPTCHA check
   */
  Authorization(User actor, boolean isHuman) {
    this.actor = actor;
    this.isHuman = isHuman;
  }

  /**
   * {@inheritDoc}
   */
  @Override public boolean is(Object permission) {
    if(null != permission && permission instanceof AccessLevel) {
      if(!atLeast(IS_AUTHENTICATED)) return false;

      AccessLevel accessLevel = (AccessLevel)permission;
      boolean check = accessLevel.ordinal() == actor.getAccessLevel().ordinal();
      logger.info(
          "check that user is exactly {}; return {}",
          accessLevel.name(),
          Boolean.valueOf(check).toString().toUpperCase());
      
      return check;
    }

    return atLeast(permission);
  }

  /**
   * {@inheritDoc}
   */
  @Override public boolean atLeast(Object permission) {
    if(!YasssCore.authRequired()) {
      logger.warn("authentication requirement has been DISABLED");
      return true;
    }
    
    else if(null == permission) {
      boolean check = atLeast(AccessLevel.ADMIN);
      logger.info(
          "permission candidate is NULL; check if user at least {}; return {}",
          AccessLevel.ADMIN.name(),
          Boolean.valueOf(check).toString().toUpperCase());
      return check;
    }
    
    else if(IS_AUTHENTICATED == permission) {
      boolean check = null != actor;
      logger.info(
          "check that user at least IS_AUTHENTICATED; return {}",
          Boolean.valueOf(check).toString().toUpperCase());
      return check;
    }
    
    else if(IS_HUMAN == permission) {
      logger.info(
          "check that user at least IS_HUMAN; return {}",
          Boolean.valueOf(isHuman).toString().toUpperCase());
      return isHuman;
    }

    else if(permission instanceof AccessLevel) {
      if(!atLeast(IS_AUTHENTICATED)) return false;
      
      AccessLevel accessLevel = (AccessLevel)permission;
      boolean check = accessLevel.ordinal() <= actor.getAccessLevel().ordinal();
      logger.info(
          "check that user at least {}; return {}",
          accessLevel.name(),
          Boolean.valueOf(check).toString().toUpperCase());
      return check;
    }

    else if(permission instanceof Event) {
      if(!atLeast(IS_AUTHENTICATED)) return false;
      
      Event event = (Event)permission;
      logger.info(
          "determining user {} access permissions to modify event {}, running subchecks",
          actor.getID().toString(),
          event.getID().toString());
      
      boolean check = actor.getID().equals(event.getAdmin());
      logger.info(
          "event {} subcheck: check that user {} is event admin {}; return {}",
          event.getID().toString(),
          null == event.getAdmin() ? "UNSPECIFIED" : event.getAdmin().toString(),
          actor.getID().toString(),
          Boolean.valueOf(check).toString().toUpperCase());

      AccessLevel accessLevel = check ? AccessLevel.STANDARD : AccessLevel.ADMIN;
      check = atLeast(accessLevel);
      logger.info(
          "event {} subcheck: check that user {} at least {}; return {}",
          event.getID().toString(),
          actor.getID().toString(),
          accessLevel.name(),
          Boolean.valueOf(check).toString().toUpperCase());

      logger.info(
          "final check to determine whether user {} has access to modify event {}; return {}",
          actor.getID().toString(),
          event.getID().toString(),
          Boolean.valueOf(check).toString().toUpperCase());
      
      return check;
    }

    else if(permission instanceof User) {
      if(!atLeast(IS_AUTHENTICATED)) return false;

      User user = (User)permission;
      logger.info(
          "determining user {} access permissions to modify user {}, running subchecks",
          actor.getID().toString(),
          user.getID().toString());

      boolean check = actor.getID().equals(user.getID());
      logger.info(
          "user access subcheck: determine whether actor {} and user {} are the same; return {}",
          actor.getID().toString(),
          user.getID().toString(),
          Boolean.valueOf(check).toString().toUpperCase());

      AccessLevel accessLevel = check ? AccessLevel.STANDARD : AccessLevel.ADMIN;
      check = atLeast(accessLevel);
      logger.info(
          "user access subcheck: check that user {} at least {}; return {}",
          actor.getID().toString(),
          accessLevel.name(),
          Boolean.valueOf(check).toString().toUpperCase());
      
      logger.info(
          "final check to determine whether user {} has access to modify user {}; return {}",
          actor.getID().toString(),
          user.getID().toString(),
          Boolean.valueOf(check).toString().toUpperCase());

      return check;
    }

    logger.info("unknown permission candidate specified; default to DENY");
    return false;
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
  public User getActor() {
    return actor;
  }
  
}
