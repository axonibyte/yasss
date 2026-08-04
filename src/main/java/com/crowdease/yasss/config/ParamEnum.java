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
   *
   * <p>The default is the sentinel {@code same-origin}, which {@link
   * com.crowdease.yasss.YasssCore} resolves to {@code api.host} -- the origin
   * the application is actually served from, since the jar serves the frontend
   * off its own classpath.
   *
   * <p>It used to default to {@code *}, which let any site on the internet read
   * the responses to anonymous requests. A wildcard is still available to a
   * deployment that genuinely serves its frontend from somewhere else; it just
   * has to ask for one rather than inherit it.
   */
  API_ALLOWED_ORIGINS(new Param("api.allowedOrigins", "same-origin")),

  /**
   * The host used to access this endpoint--generally used for links in outgoing
   * emails and the like.
   */
  API_HOST(new Param("api.host", "http://127.0.0.1:7455")),

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
   * The shortest password an operator will allow on this deployment.
   *
   * <p>Published to the client via {@code GET /v1} and enforced there. It
   * cannot be enforced here: the password never reaches the server. The client
   * derives an Ed25519 keypair from it with scrypt and sends only the public
   * key, which is the point of the scheme and the reason this is a policy the
   * server states rather than a rule it checks.
   *
   * <p>Applies to setting a password -- registration, profile update, reset --
   * and never to logging in, so raising it cannot lock out an existing account.
   */
  AUTH_PASSWORD_MIN_LENGTH(new Param("auth.password.minLength", 8)),
  
  /**
   * Path to the configuration file.
   */
  CONFIG_FILE(new Param("config.file", null)),

  /**
   * Whether volunteer reminders are sent at all.
   */
  REMINDER_ENABLED(new Param("reminders.enabled", true)),

  /**
   * Minutes between reminder sweeps.
   */
  REMINDER_POLL_INTERVAL(new Param("reminders.pollInterval", 5)),

  /**
   * How long before an event begins to send its reminder, in minutes.
   */
  REMINDER_LEAD_TIME(new Param("reminders.leadTime", 1440)),

  /**
   * The most reminders to send in a single sweep.
   */
  REMINDER_BATCH_SIZE(new Param("reminders.batchSize", 200)),

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
   * Determines whether or not debug logs should be enabled.
   */
  DEBUG_ENABLED(new Param("debug", false)),

  /**
   * Boolean indicating whether or not email services should be enabled.
   */
  EMAIL_ENABLED(new Param("email.enabled", false)),

  /**
   * The "from" email address included in outgoing emails.
   */
  EMAIL_SENDER_ADDRESS(new Param("email.sender.address")),

  /**
   * The informal name of the "from" email address sender.
   */
  EMAIL_SENDER_NAME(new Param("email.sender.name", "Yasss!")),

  /**
   * The email server hostname. Required only if outoging emails are enabled.
   */
  EMAIL_SMTP_HOST(new Param("email.smtp.host")),

  /**
   * The email server's port number. Required only if outgoing emails are enabled.
   */
  EMAIL_SMTP_PORT(new Param("email.smtp.port", 587)),

  /**
   * The username for email server authentication. Required only if outgoing emails are enabled.
   */
  EMAIL_SMTP_USERNAME(new Param("email.smtp.user")),

  /**
   * The password for email server authentication. Required only if outgoing emails are enabled.
   */
  EMAIL_SMTP_PASSWORD(new Param("email.smtp.password")),

  /**
   * The SMTP transport strategy: SMTP, SMTP_TLS or SMTPS. Defaults to
   * SMTP_TLS; plain SMTP exists for local relays and test sinks.
   */
  EMAIL_SMTP_TRANSPORT(new Param("email.smtp.transport", "SMTP_TLS")),

  /**
   * The accent color used in outgoing emails.
   */
  EMAIL_TEMPLATE_ACCENT_COLOR(new Param("email.template.accentColor", "#00d1b2")),

  /**
   * The path to the header image in outgoing emails.
   */
  EMAIL_TEMPLATE_HEADER_IMAGE(
      new Param(
          "email.template.headerImage",
          "http://127.0.0.1:7455/assets/img/yasss_logo_small.png")),

  /**
   * Enable payments; if enabled, non-admins are redirected to a payments page
   * when creating an event.
   */
  PAYMENTS_ENABLED(new Param("payments.enabled", false)),

  /**
   * Required only if payments are enabled; Stripe API key.
   */
  PAYMENTS_STRIPE_API_KEY(new Param("payments.stripe.apiKey")),

  /**
   * Required only if payments are enabled; the price ID for the event line item.
   */
  PAYMENTS_STRIPE_LOOKUP_KEY(new Param("payments.stripe.lookupKey")),

  /**
   * Path to the "call to action" markdown file.
   */
  TEXTS_CALL_TO_ACTION(new Param("texts.callToAction")),

  /**
   * Path to the "terms of service" markdown file.
   */
  TEXTS_TERMS_OF_SERVICE(new Param("texts.termsOfService")),

  /**
   * Path to the "privacy policy" markdown file.
   */
  TEXTS_PRIVACY_POLICY(new Param("texts.privacyPolicy")),
  
  /**
   * How long a session may go untouched before it must be re-established, in
   * minutes. Default: seven days.
   *
   * <p>Measured from the last authenticated request, since every one of them
   * restamps the ticket.
   */
  SESSION_IDLE_TIMEOUT(new Param("session.idleTimeout", 10080)),

  /**
   * How long a session may live at all, however active, in minutes. Default:
   * thirty days.
   *
   * <p>Also the floor on how long the ticket engine must retain a signing key:
   * a session cannot outlive the key that signs it, so
   * {@code ticket.refreshInterval} and {@code ticket.maxHistory} are stretched
   * to cover this if they do not already. See {@code TicketEngine.signerCount}.
   */
  SESSION_ABSOLUTE_TIMEOUT(new Param("session.absoluteTimeout", 43200)),

  /**
   * How long an emailed account-verification link stays good, in minutes.
   * Default: twenty-four hours.
   */
  TOKEN_VERIFY_TTL(new Param("token.verifyTTL", 1440)),

  /**
   * How long an emailed credential-reset link stays good, in minutes. Default:
   * one hour.
   *
   * <p>Much shorter than the verification link on purpose. Following a stale
   * verification link confirms an address; following a stale reset link takes
   * over the account.
   */
  TOKEN_RESET_TTL(new Param("token.resetTTL", 60)),

  /**
   * The global secret for the ticket engine and, ultimately, all users.
   *
   * <p>Load-bearing beyond its name. Without it {@code Credentialed}'s crypto
   * helper is the identity function, so the ticket engine refuses to persist its
   * signing keys rather than write them to the database in the clear -- which
   * means every restart signs out every user. The shipped placeholder counts as
   * unset; see {@code TicketSigner.persistenceAllowed}.
   */
  TICKET_GLOBAL_SECRET(new Param("ticket.globalSecret", null)),

  /**
   * The floor on how many signing keys (current and historical) are retained.
   *
   * <p>A floor rather than a cap: {@code session.absoluteTimeout} raises it when
   * it has to, because a session cannot outlive the key that signed it. It is no
   * longer a cost multiplier on failed authentication -- a ticket names the
   * signer that signed it, so verification is one lookup and one signature check
   * however much history is held.
   */
  TICKET_MAX_HISTORY(new Param("ticket.maxHistory", 15)),

  /**
   * Number of minutes between each regeneration of the system signing key.
   *
   * <p>Was one minute, which wrote 1,440 keys a day once they became durable and
   * bought nothing: rotation limits the blast radius of a leaked signing key, and
   * a day is a reasonable granularity for that.
   */
  TICKET_REFRESH_INTERVAL(new Param("ticket.refreshInterval", 1440));

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
