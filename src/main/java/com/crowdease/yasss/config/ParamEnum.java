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
   * The host used to access this endpoint--generally used for links in outgoing
   * emails and the like.
   */
  API_HOST(new Param("api.host", "")),

  /**
   * Require a CAPTCHA when a CAPTCHA would normally be required (e.g. when
   * creating a new event or signing up for an event.
   */
  AUTH_CAPTCHA_REQUIRED(new Param("auth.captcha.required", false)),

  /**
   * Required if CAPTCHAs are enabled. Denotes the Google Cloud project.
   */
  AUTH_CAPTCHA_CLOUD_PROJECT(new Param("auth.captcha.cloudProject")),

  /**
   * Required if CAPTCHAs are enabled. Path to the reCAPTCHA service account keyfile.
   */
  AUTH_CAPTCHA_KEYFILE(new Param("auth.captcha.keyFile")),

  /**
   * Optional. CAPTCHA IP cache TTL.
   */
  AUTH_CAPTCHA_GRACE_PERIOD(new Param("auth.captcha.gracePeriod", 10000L)),

  /**
   * Optional. Minimum reCAPTCHA score to consider a user legitimate.
   */
  AUTH_CAPTCHA_MINIMUM_SCORE(new Param("auth.captcha.minScore", 0.7f)),

  /**
   * Required if CAPTCHAs are enabled. Denotes the Google reCAPTCHA v2 site key.
   */
  AUTH_CAPTCHA_SITE_KEY(new Param("auth.captcha.siteKey")),

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
   * Boolean indicating whether or not email services should be enabled.
   */
  EMAIL_ENABLED(new Param("email.enabled", false)),

  /**
   * The "from" email address included in outgoing emails.
   */
  EMAIL_SENDER(new Param("email.sender")),

  /**
   * The email server hostname. Required only if outoging emails are enabled.
   */
  EMAIL_SMTP_HOST(new Param("email.smtpHost")),

  /**
   * The email server's port number. Required only if outgoing emails are enabled.
   */
  EMAIL_SMTP_PORT(new Param("email.smtpPort", 587)),

  /**
   * The username for email server authentication. Required only if outgoing emails are enabled.
   */
  EMAIL_SMTP_USERNAME(new Param("email.smtpUser")),

  /**
   * The password for email server authentication. Required only if outgoing emails are enabled.
   */
  EMAIL_SMTP_PASSWORD(new Param("email.smtpPassword")),

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

  /**
   * {@inheritDoc}
   */
  @Override public String toString() {
    return param.toString();
  }
  
}
