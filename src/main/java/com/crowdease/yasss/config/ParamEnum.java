/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.config;

import com.axonibyte.lib.cfg.Param;

/**
 * Defines an enumerable set of configuration parameters.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public enum ParamEnum {

  /**
   * The port on which the API is exposed.
   */
  API_PORT(new Param("api.port", "7455")),

  /**
   * The CORS origin setting for the API.
   */
  API_ALLOWED_ORIGINS(new Param("api.allowedOrigins", "*")),

  /**
   * Required if CAPTCHAs are enabled. Denotes the Google reCAPTCHA v2 secret key.
   */
  AUTH_CAPTCHA_SECRET_KEY(new Param("auth.captchaSecretKey")),

  /**
   * Required if CAPTCHAs are enabled. Denotes the Google reCAPTCHA v2 site key.
   */
  AUTH_CAPTCHA_SITE_KEY(new Param("auth.captchaSiteKey")),

  /**
   * Require a CAPTCHA when a CAPTCHA would normally be required (e.g. when
   * creating a new event or signing up for an event.
   */
  AUTH_REQUIRE_CAPTCHA(new Param("auth.requireCAPTCHA")),

  /**
   * Require users to log in if they are changing an existing resource.
   */
  AUTH_REQUIRE_SIGNIN(new Param("auth.requireSignin", true)),

  /**
   * Require payment when an event is published or re-published.
   */
  AUTH_REQUIRE_PAYMENT(new Param("auth.requirePayment")),
  
  /**
   * Path to the configuration file.
   */
  CONFIG_FILE(new Param("config.file", null)),

  /**
   * The location of the database (location:port/name).
   */
  DB_LOCATION(new Param("db.location", null)),

  /**
   * The username used to access the database.
   */
  DB_USERNAME(new Param("db.username", null)),

  /**
   * The password used to access the database.
   */
  DB_PASSWORD(new Param("db.password", null)),

  /**
   * The prefix to be prepended to table names.
   */
  DB_PREFIX(new Param("db.prefix", "yasss_")),

  /**
   * Boolean indicating whether or not the use a secure line to the database.
   */
  DB_SECURE(new Param("db.secure", false)),

  /**
   * The global secret for the ticket engine and, ultimately, all users.
   */
  TICKET_GLOBAL_SECRET(new Param("ticket.globalSecret", null)),
  
  /**
   * Maximum number of signing keys (current and historical) that will render a
   * verified message is valid.
   */
  TICKET_MAX_HISTORY(new Param("ticket.maxHistory", 15)),
  
  /**
   * Number of minutes between each regeneration of the system signing key.
   */
  TICKET_REFRESH_INTERVAL(new Param("ticket.refreshInterval", 1));

  private final Param param;

  private ParamEnum(Param param) {
    this.param = param;
  }

  /**
   * Retrieves the raw configuration parameter.
   *
   * @return the {@link Param} associated with the {@link ParamEnum}
   */
  public Param param() {
    return param;
  }
  
}
