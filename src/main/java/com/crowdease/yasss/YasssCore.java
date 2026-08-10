/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.TimeZone;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.cfg.CLConfig;
import com.axonibyte.lib.cfg.Config;
import com.axonibyte.lib.cfg.FileConfig;
import com.axonibyte.lib.cfg.Config.BadParamException;
import com.axonibyte.lib.cfg.FileConfig.FileReadException;
import com.axonibyte.lib.db.Database;
import com.axonibyte.lib.http.APIDriver;
import com.crowdease.yasss.api.APIEndpoint;
import com.crowdease.yasss.api.APIInfoEndpoint;
import com.crowdease.yasss.api.AddActivityEndpoint;
import com.crowdease.yasss.api.AddDetailEndpoint;
import com.crowdease.yasss.api.AddVolunteerEndpoint;
import com.crowdease.yasss.api.AddWindowEndpoint;
import com.crowdease.yasss.api.CreateEventEndpoint;
import com.crowdease.yasss.api.CreateUserEndpoint;
import com.crowdease.yasss.api.EventReportEndpoint;
import com.crowdease.yasss.api.ListEventsEndpoint;
import com.crowdease.yasss.api.ListUsersEndpoint;
import com.crowdease.yasss.api.ModifyActivityEndpoint;
import com.crowdease.yasss.api.ModifyDetailEndpoint;
import com.crowdease.yasss.api.ModifyEventEndpoint;
import com.crowdease.yasss.api.ModifyUserEndpoint;
import com.crowdease.yasss.api.ModifyVolunteerEndpoint;
import com.crowdease.yasss.api.ModifyWindowEndpoint;
import com.crowdease.yasss.api.MagicLinkSessionEndpoint;
import com.crowdease.yasss.api.PasskeyAuthEndpoint;
import com.crowdease.yasss.api.PasskeyListEndpoint;
import com.crowdease.yasss.api.PasskeyRegistrationEndpoint;
import com.crowdease.yasss.api.PublicTextEndpoint;
import com.crowdease.yasss.api.RemoveActivityEndpoint;
import com.crowdease.yasss.api.RemoveDetailEndpoint;
import com.crowdease.yasss.api.RemoveEventEndpoint;
import com.crowdease.yasss.api.RemoveUserEndpoint;
import com.crowdease.yasss.api.RemoveVolunteerEndpoint;
import com.crowdease.yasss.api.ReminderSubscriptionEndpoint;
import com.crowdease.yasss.api.RemoveWindowEndpoint;
import com.crowdease.yasss.api.ResetUserEndpoint;
import com.crowdease.yasss.api.RevokeSessionsEndpoint;
import com.crowdease.yasss.api.RetrieveEventEndpoint;
import com.crowdease.yasss.api.RetrieveUserEndpoint;
import com.crowdease.yasss.api.SetRSVPEndpoint;
import com.crowdease.yasss.api.SetSlotEndpoint;
import com.crowdease.yasss.api.UnsetRSVPEndpoint;
import com.crowdease.yasss.api.UnsetSlotEndpoint;
import com.crowdease.yasss.api.VerifyUserEndpoint;
import com.crowdease.yasss.api.AddPollDetailEndpoint;
import com.crowdease.yasss.api.AddPollOptionEndpoint;
import com.crowdease.yasss.api.AddPollWindowEndpoint;
import com.crowdease.yasss.api.CreatePollEndpoint;
import com.crowdease.yasss.api.ListPollsEndpoint;
import com.crowdease.yasss.api.ModifyPollDetailEndpoint;
import com.crowdease.yasss.api.ModifyPollEndpoint;
import com.crowdease.yasss.api.ModifyPollOptionEndpoint;
import com.crowdease.yasss.api.ModifyPollWindowEndpoint;
import com.crowdease.yasss.api.RemovePollDetailEndpoint;
import com.crowdease.yasss.api.RemovePollEndpoint;
import com.crowdease.yasss.api.RemovePollOptionEndpoint;
import com.crowdease.yasss.api.RemovePollWindowEndpoint;
import com.crowdease.yasss.api.ResolveCodeEndpoint;
import com.crowdease.yasss.api.RetrievePollEndpoint;
import com.crowdease.yasss.api.SetPollCellEndpoint;
import com.crowdease.yasss.api.UnsetPollCellEndpoint;
import com.crowdease.yasss.api.AddPollResponseEndpoint;
import com.crowdease.yasss.api.ModifyPollResponseEndpoint;
import com.crowdease.yasss.api.RemovePollResponseEndpoint;
import com.crowdease.yasss.config.ParamEnum;
import com.crowdease.yasss.daemon.StripeDriver;
import com.crowdease.yasss.daemon.ReminderEngine;
import com.crowdease.yasss.daemon.TicketEngine;
import com.crowdease.yasss.model.CAPTCHAValidator;
import com.crowdease.yasss.model.CredentialMigrator;
import com.crowdease.yasss.model.Mail;
import com.crowdease.yasss.model.RelyingPartyConfig;
import com.crowdease.yasss.model.TicketSigner;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Yet Another Service Scheduling System
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class YasssCore {

  private static final Logger logger = LoggerFactory.getLogger(YasssCore.class);
  private static final long launchTime = System.currentTimeMillis();

  private static APIDriver apiDriver = null;
  private static CAPTCHAValidator captchaValidator = null;
  private static Config config = null;
  private static Database database = null;
  private static TicketEngine ticketEngine = null;
  private static ReminderEngine reminderEngine = null;
  private static String apiHost = "";
  private static StripeDriver stripe = null;
  private static boolean authRequired = true;
  private static boolean debugEnabled = false;
  private static int passwordMinLength = 8;
  private static RelyingPartyConfig.Resolved relyingParty = null;
  private static String relyingPartyName = "Yasss!";
  private static long passkeyChallengeTTL = 0L;
  private static long sigMaxSkew = 0L;
  private static String sigAudience = null;
  private static boolean acceptLegacySig = true;
  private static long sessionIdleTimeout = 0L;
  private static long sessionAbsoluteTimeout = 0L;
  private static long verifyTokenTTL = 0L;
  private static long resetTokenTTL = 0L;

  /**
   * Converts a configured duration in minutes to milliseconds.
   *
   * <p>Every one of these is configured in minutes to match {@code reminders.*},
   * and compared against {@link System#currentTimeMillis()}. The multiplication
   * is done as a {@code long} because thirty days of minutes times sixty
   * thousand overflows an {@code int} several times over.
   *
   * @param minutes the configured value
   * @return the equivalent in milliseconds
   */
  private static long minutesToMillis(int minutes) {
    return minutes * 60L * 1000L;
  }

  /**
   * How long shutdown waits for each daemon to finish what it is doing.
   *
   * Short enough not to hold up a restart, long enough for an in-flight
   * reminder batch to drain rather than being abandoned after its claim rows
   * were already written.
   */
  private static final long SHUTDOWN_GRACE_MS = 5_000L;

  /**
   * The zone every instant is stored in.
   *
   * <p>Not a display preference. Event times live in {@code DATETIME} columns,
   * which carry no zone at all -- they hold a wall-clock reading and nothing
   * else. The JDBC driver turns a {@link java.sql.Timestamp}, which is an
   * instant, into one of those by rendering it in <em>the JVM's default
   * zone</em>, and turns it back the same way. So the JVM's zone is not
   * incidental to storage: it <em>is</em> the storage format.
   *
   * <p>That is symmetric, so nothing looks wrong while the zone stays put. It
   * stops being symmetric the moment it moves. Relocate the server, change the
   * base image, set {@code TZ} in a unit file, and every instant already in the
   * database is reinterpreted -- 09:00 recorded in Chicago reads back as 09:00
   * UTC, three hours of silent drift across every event, window and reminder,
   * with nothing in any log to say so.
   */
  private static final TimeZone STORAGE_ZONE = TimeZone.getTimeZone("UTC");

  /**
   * Pins the JVM's default zone so stored instants cannot drift.
   *
   * <p>Deliberately a pin rather than a conversion. The container this ships in
   * has always been UTC -- no {@code TZ}, and {@code /etc/localtime} pointing at
   * {@code Etc/UTC} -- so the data on disk is already right and needs no
   * migration. What it lacked was a guarantee: it was right by accident of the
   * base image, and one {@code TZ=America/Chicago} away from being wrong
   * everywhere at once. This makes it right on purpose.
   *
   * <p>A deployment that has been running in some other zone is a different
   * matter, and is <em>not</em> handled here; see
   * {@code docs/utc-storage.md} for the one-time conversion, and for why it is
   * a manual step rather than a migration script.
   *
   * @return the zone that was in force beforehand, for the log and for tests
   */
  static TimeZone pinStorageZone() {
    TimeZone previous = TimeZone.getDefault();
    TimeZone.setDefault(STORAGE_ZONE);
    if(!STORAGE_ZONE.getID().equals(previous.getID()))
      logger.warn(
          "JVM time zone was {}; pinned to {} because DATETIME storage is "
          + "interpreted in it. Stored instants written under {} will read back "
          + "shifted -- see docs/utc-storage.md.",
          previous.getID(),
          STORAGE_ZONE.getID(),
          previous.getID());
    return previous;
  }

  /**
   * Entry-point.
   *
   * @param args command-line arguments
   */
  public static void main(String[] args) {

    // Before anything else, and before the first connection in particular.
    pinStorageZone();

    logger.info("Yasss! {} starting up", getVersion());

    try {

      config = new CLConfig();
      for(var param : ParamEnum.values())
      config.defineParam(param.param());
      ((CLConfig)config).loadArgs(args);

      try {
        FileConfig fCfg = new FileConfig(
            config.getString(ParamEnum.CONFIG_FILE));
        for(var param : ParamEnum.values())
          if(ParamEnum.CONFIG_FILE != param)
            fCfg.defineParam(param.param());
        fCfg.load();
        config = fCfg.merge(config);
      } catch(BadParamException e) {
        logger.warn("No configuration file specified.");
      }

      debugEnabled = config.getBoolean(ParamEnum.DEBUG_ENABLED);
      passwordMinLength = config.getInteger(ParamEnum.AUTH_PASSWORD_MIN_LENGTH);

      database = new Database(
          config.getString(ParamEnum.DB_LOCATION),
          config.getString(ParamEnum.DB_PREFIX),
          config.getString(ParamEnum.DB_USERNAME),
          config.getString(ParamEnum.DB_PASSWORD),
          config.getBoolean(ParamEnum.DB_SECURE));
      database.setup(YasssCore.class, "db");

      String globalSecret = config.getString(ParamEnum.TICKET_GLOBAL_SECRET);

      // Refusing to start is the least bad outcome, and it is a change in behavior for
      // any deployment that never set this.
      //
      // Since axb-lib-auth-java 0.1.0, Credentialed refuses to encrypt credential
      // material without a secret rather than silently returning it unencrypted. That
      // makes TicketEngine.rotate's regenerateKeypair() throw; rotate catches and returns;
      // start() leaves the signer deque empty; sign() then throws "signer queue has not
      // yet been populated" on every request that needs a ticket. The process starts
      // cleanly, GET /v1 reports ok, the health check passes -- and nobody can
      // authenticate. That is far worse to diagnose than a startup error naming the
      // parameter, so fail here instead.
      if(null == globalSecret || globalSecret.isBlank())
        throw new MisconfigurationException(
            "ticket.globalSecret is not set. It is required: without it the ticket engine "
            + "cannot generate a signing key, so the server would start, report healthy, "
            + "and fail every authenticated request. See docs/upstream-axb-lib-auth.md.");

      Credentialed.setGlobalSecret(globalSecret);
      // Decided once, here, rather than each time a signer is written: whether
      // signing keys may go to disk at all is a property of the deployment, and
      // the answer must not vary between one call and the next.
      boolean persistSigners = TicketSigner.persistenceAllowed(globalSecret);

      // Legacy fixed-IV MFA secrets get rewritten in the current format here, while the
      // database and the secret are both available and nothing is listening yet. The
      // library reads the old format transparently, so this is not required for
      // correctness -- but reading is not migrating, and without it the accounts that
      // keep fixed-IV ciphertext forever are the ones that never change a credential.
      //
      // Idempotent and non-fatal, in the shape of Event.backfillCodes below: after the
      // first boot it finds nothing and says nothing.
      try {
        var swept = CredentialMigrator.sweepMFASecrets();
        if(0 < swept.migrated())
          logger.info("re-encrypted {} MFA secret(s) in the current format", swept.migrated());
        if(0 < swept.adopted())
          logger.warn(
              "encrypted {} previously-unencrypted MFA secret(s); they were stored in the "
              + "clear by a deployment running without a ticket.globalSecret",
              swept.adopted());
        if(0 < swept.failed())
          logger.warn(
              "{} MFA secret(s) could not be read and were left untouched; those accounts "
              + "must re-enroll -- see docs/upstream-axb-lib-auth.md",
              swept.failed());
      } catch(SQLException e) {
        logger.error("could not sweep stored MFA secrets: {}", e.getMessage());
      }

      sigMaxSkew = minutesToMillis(config.getInteger(ParamEnum.AUTH_SIG_MAX_SKEW));
      acceptLegacySig = config.getBoolean(ParamEnum.AUTH_ACCEPT_LEGACY_SIG);

      // Derived from api.host when unset, which is the same source the CORS sentinel
      // uses. A client cannot compute this for itself: behind a proxy the public name is
      // not something the browser can infer, and a wrong audience fails every sign-in
      // with nothing in any log to say why. So the server publishes it and the client
      // signs what it is given.
      sigAudience = config.getString(ParamEnum.AUTH_SIG_AUDIENCE);
      if(null == sigAudience || sigAudience.isBlank() || "same-origin".equals(sigAudience)) {
        try {
          sigAudience = new java.net.URI(config.getString(ParamEnum.API_HOST)).getHost();
        } catch(java.net.URISyntaxException e) {
          sigAudience = null;
        }
        if(null == sigAudience || sigAudience.isBlank())
          throw new MisconfigurationException(
              "auth.sigAudience is unset and api.host is not a URL with a host, so there "
              + "is nothing to bind credentials to. Set one of them.");
      }
      logger.info("credentials are bound to audience {}", sigAudience);

      // Resolved once, at boot, and logged either way. A relying party is permanent --
      // a credential is bound to it for life and there is no migration -- so an operator
      // debugging a passkey that stopped working needs to be able to see what it was.
      relyingPartyName = config.getString(ParamEnum.PASSKEY_RP_NAME);
      passkeyChallengeTTL = minutesToMillis(config.getInteger(ParamEnum.PASSKEY_CHALLENGE_TTL));
      relyingParty = RelyingPartyConfig.resolve(
          config.getString(ParamEnum.PASSKEY_RP_ID),
          config.getString(ParamEnum.API_HOST),
          config.getString(ParamEnum.PASSKEY_ORIGINS));

      if(!config.getBoolean(ParamEnum.PASSKEY_ENABLED)) {
        relyingParty = null;
        logger.info("passkeys are disabled by configuration");
      } else if(!relyingParty.usable()) {
        // Not fatal: everything else about the deployment works, and refusing to boot over
        // an optional credential type would be worse than the problem. But it is an error
        // rather than a warning, because the alternative is a sign-in button that fails
        // inside the browser with nothing server-side to say why.
        logger.error(
            "passkeys are unavailable: {}. Set passkey.rpID, or point api.host at a "
            + "hostname. Until then the client will not offer them.",
            relyingParty.refusal().detail());
        relyingParty = null;
      } else {
        logger.info(
            "passkeys are bound to relying party {} and origin(s) {}",
            relyingParty.rpID(),
            relyingParty.origins());
      }

      sessionIdleTimeout = minutesToMillis(config.getInteger(ParamEnum.SESSION_IDLE_TIMEOUT));
      sessionAbsoluteTimeout =
          minutesToMillis(config.getInteger(ParamEnum.SESSION_ABSOLUTE_TIMEOUT));
      verifyTokenTTL = minutesToMillis(config.getInteger(ParamEnum.TOKEN_VERIFY_TTL));
      resetTokenTTL = minutesToMillis(config.getInteger(ParamEnum.TOKEN_RESET_TTL));

      if(config.getBoolean(ParamEnum.PAYMENTS_ENABLED))
        stripe = new StripeDriver(
            config.getString(ParamEnum.PAYMENTS_STRIPE_API_KEY),
            config.getString(ParamEnum.PAYMENTS_STRIPE_LOOKUP_KEY));

      if(config.getBoolean(ParamEnum.EMAIL_ENABLED))
        Mail.initMailer(
            config.getString(ParamEnum.EMAIL_SMTP_HOST),
            config.getInteger(ParamEnum.EMAIL_SMTP_PORT),
            config.getString(ParamEnum.EMAIL_SMTP_USERNAME),
            config.getString(ParamEnum.EMAIL_SMTP_PASSWORD),
            config.getString(ParamEnum.EMAIL_SMTP_TRANSPORT),
            config.getString(ParamEnum.EMAIL_SENDER_ADDRESS),
            config.getString(ParamEnum.EMAIL_SENDER_NAME));
      Mail.setTemplate(
          config.getString(ParamEnum.EMAIL_TEMPLATE_ACCENT_COLOR),
          config.getString(ParamEnum.EMAIL_TEMPLATE_HEADER_IMAGE));
      
      authRequired = config.getBoolean(ParamEnum.AUTH_REQUIRE_SIGNIN);

      if(config.getBoolean(ParamEnum.AUTH_CAPTCHA_REQUIRED))
        captchaValidator = new CAPTCHAValidator(
            config.getString(ParamEnum.AUTH_CAPTCHA_KEYFILE),
            config.getString(ParamEnum.AUTH_CAPTCHA_CLOUD_PROJECT),
            config.getString(ParamEnum.AUTH_CAPTCHA_SITE_KEY),
            (float)config.getDouble(ParamEnum.AUTH_CAPTCHA_MINIMUM_SCORE),
            config.getLong(ParamEnum.AUTH_CAPTCHA_GRACE_PERIOD));

      ticketEngine = new TicketEngine(
          config.getInteger(ParamEnum.TICKET_REFRESH_INTERVAL),
          config.getInteger(ParamEnum.TICKET_MAX_HISTORY),
          config.getInteger(ParamEnum.SESSION_ABSOLUTE_TIMEOUT),
          persistSigners);
      ticketEngine.start();

      // Only started when there is somewhere for the mail to go. Running it
      // without a mailer would claim every pending reminder and deliver none,
      // permanently marking the backlog as sent.
      boolean remindersEnabled = config.getBoolean(ParamEnum.REMINDER_ENABLED);
      boolean emailEnabled = config.getBoolean(ParamEnum.EMAIL_ENABLED);
      if(remindersEnabled && emailEnabled) {
        reminderEngine = new ReminderEngine(
            config.getInteger(ParamEnum.REMINDER_POLL_INTERVAL),
            config.getInteger(ParamEnum.REMINDER_LEAD_TIME),
            config.getInteger(ParamEnum.REMINDER_BATCH_SIZE),
            true);
        reminderEngine.start();
      } else {
        logger.info(
            "reminders are off ({} is disabled)",
            remindersEnabled ? "email.enabled" : "reminders.enabled");
      }

      apiHost = config.getString(ParamEnum.API_HOST);

      // Same-origin by default, rather than "anybody". A wildcard is still
      // available to a deployment that serves its frontend from a different
      // host; it just has to ask for one rather than inherit it.
      String allowedOrigins = config.getString(ParamEnum.API_ALLOWED_ORIGINS);
      if(null == allowedOrigins || allowedOrigins.isBlank()
          || "same-origin".equalsIgnoreCase(allowedOrigins.strip()))
        allowedOrigins = apiHost;
      logger.info("CORS origins: {}", allowedOrigins);

      apiDriver = new APIDriver.Builder()
          .setPort(
              config.getInteger(
                  ParamEnum.API_PORT))
          .setPublicFolder("/public")
          .addAllowedOrigins(allowedOrigins)
          .addExposedHeaders(
              APIEndpoint.ACCOUNT_HEADER,
              APIEndpoint.SESSION_HEADER,
              // Set on every authenticated response and read by the client to
              // drive admin overrides, but previously not exposed -- so it
              // silently vanished cross-origin, e.g. the Vite dev server.
              APIEndpoint.ACCESS_LEVEL_HEADER,
              // Both are how a client with a wrong clock recovers rather than being told
              // its password is bad. Exposed for the same reason ACCESS_LEVEL_HEADER
              // above had to be: unexposed, they silently vanish cross-origin, and the
              // recovery would work in production and not in the dev server.
              APIEndpoint.AUTH_HINT_HEADER,
              APIEndpoint.SERVER_TIME_HEADER)
          .addEndpoints(
              new APIInfoEndpoint(),
              new PasskeyRegistrationEndpoint(PasskeyRegistrationEndpoint.Mode.BEGIN),
              new PasskeyRegistrationEndpoint(PasskeyRegistrationEndpoint.Mode.FINISH),
              new PasskeyListEndpoint(PasskeyListEndpoint.Mode.LIST),
              new PasskeyListEndpoint(PasskeyListEndpoint.Mode.REMOVE),
              new MagicLinkSessionEndpoint(),
              new PasskeyAuthEndpoint(PasskeyAuthEndpoint.Mode.BEGIN),
              new PasskeyAuthEndpoint(PasskeyAuthEndpoint.Mode.FINISH),
              new AddActivityEndpoint(),
              new AddDetailEndpoint(),
              new AddPollDetailEndpoint(),
              new AddPollResponseEndpoint(),
              new AddPollOptionEndpoint(),
              new AddPollWindowEndpoint(),
              new AddVolunteerEndpoint(),
              new AddWindowEndpoint(),
              new CreateEventEndpoint(),
              new CreatePollEndpoint(),
              new CreateUserEndpoint(),
              new EventReportEndpoint(),
              new ListEventsEndpoint(),
              new ListPollsEndpoint(),
              new ListUsersEndpoint(),
              new ModifyActivityEndpoint(),
              new ModifyDetailEndpoint(),
              new ModifyEventEndpoint(),
              new ModifyPollEndpoint(),
              new ModifyPollDetailEndpoint(),
              new ModifyPollOptionEndpoint(),
              new ModifyPollResponseEndpoint(),
              new ModifyPollWindowEndpoint(),
              new ModifyUserEndpoint(),
              new ModifyVolunteerEndpoint(),
              new ModifyWindowEndpoint(),
              new PublicTextEndpoint(),
              new RemoveActivityEndpoint(),
              new RemoveDetailEndpoint(),
              new RemoveEventEndpoint(),
              new RemovePollEndpoint(),
              new RemovePollDetailEndpoint(),
              new RemovePollOptionEndpoint(),
              new RemovePollResponseEndpoint(),
              new RemovePollWindowEndpoint(),
              new RemoveUserEndpoint(),
              new RemoveVolunteerEndpoint(),
              new ReminderSubscriptionEndpoint(ReminderSubscriptionEndpoint.Mode.CONFIRM),
              new ReminderSubscriptionEndpoint(ReminderSubscriptionEndpoint.Mode.UNSUBSCRIBE),
              new RemoveWindowEndpoint(),
              new ResetUserEndpoint(),
              new RevokeSessionsEndpoint(RevokeSessionsEndpoint.Mode.ACCOUNT),
              new RevokeSessionsEndpoint(RevokeSessionsEndpoint.Mode.PLATFORM),
              new ResolveCodeEndpoint(),
              new RetrieveEventEndpoint(),
              new RetrievePollEndpoint(),
              new RetrieveUserEndpoint(),
              new SetRSVPEndpoint(),
              new SetPollCellEndpoint(),
              new SetSlotEndpoint(),
              new UnsetRSVPEndpoint(),
              new UnsetPollCellEndpoint(),
              new UnsetSlotEndpoint(),
              new VerifyUserEndpoint())
          .build();

      for(var textFile : PublicTextEndpoint.TextFile.values()) {
        try {
          PublicTextEndpoint.loadResource(
              textFile,
              config.getString(textFile));
        } catch(BadParamException e) {
          logger.error(
              "could not load {} ({}): {}",
              textFile.name(),
              textFile.toString(),
              e.getMessage());
        }
      }

      // Codes issued before the shared registry existed get registered in it.
      // Must come before the backfill below: a code minted for a legacy event
      // is checked against this table, so the table has to know about the codes
      // it could collide with first.
      try {
        int registered = com.crowdease.yasss.model.AccessCode.backfill();
        if(0 < registered)
          logger.info("registered {} existing short code(s)", registered);
      } catch(SQLException e) {
        logger.error("could not register existing short codes: {}", e.getMessage());
      }

      // Events created before short codes existed get one now. No-ops on every
      // boot after the first, and a failure here is logged rather than fatal --
      // an event without a code is still perfectly usable by UUID.
      try {
        int coded = com.crowdease.yasss.model.Event.backfillCodes();
        if(0 < coded) logger.info("assigned short codes to {} existing event(s)", coded);
      } catch(SQLException e) {
        logger.error("could not backfill event codes: {}", e.getMessage());
      }

      Runtime.getRuntime().addShutdownHook(new Thread() {
        @Override public void run() {
          logger.info("Shutting down...");
          apiDriver.halt();
          ticketEngine.stop();
          // Null guard required, not decorative: unlike the ticket engine this
          // one is only conditionally constructed. Same class of bug as the
          // CAPTCHA validator's unconditional close.
          if(null != reminderEngine) reminderEngine.stop();
          if(null != captchaValidator) captchaValidator.close(); // null when CAPTCHAs are disabled

          // Both daemons are interrupt-and-forget, and both are daemon threads,
          // so the JVM used to exit out from under whatever they were doing. For
          // the reminder engine that matters: it writes its claim row *before*
          // sending, so a sweep killed mid-batch has already marked reminders as
          // taken and they are at-most-once by design -- those people simply
          // never get theirs. Waiting briefly lets an in-flight batch finish.
          ticketEngine.join(SHUTDOWN_GRACE_MS);
          if(null != reminderEngine) reminderEngine.join(SHUTDOWN_GRACE_MS);

          // Last, and after both joins on purpose: a sweep still draining its
          // batch needs the pool it is writing through, and pulling that out
          // from under it would turn an orderly shutdown into the abandoned
          // one the joins above exist to prevent.
          //
          // This was previously impossible -- axb-lib-db exposed no way to
          // close the pool at all, which was recorded as an upstream gap. It
          // does now, as of 0.5.0.
          if(null != database) database.close();

          logger.info("Goodbye! ^_^");
        }
      });

    } catch(FileReadException e) {
      
      File diskConfig = new File(
          config.getString(ParamEnum.CONFIG_FILE));

      if(diskConfig.exists()) {
        logger.error("Failed to read config file: {}", e.getMessage());
      } else {
        try {
          Files.copy(
              YasssCore.class.getResourceAsStream("/defaults/yasss.cfg"),
              Paths.get(diskConfig.toURI()));
          logger.warn("Saved default config file. Please modify and try again!");
        } catch(IOException e2) {
          logger.error("Failed to save the default config file: {}", e2.getMessage());
        }
      }

      // Both branches are a failed start, and this one used to fall off the end
      // of main and exit 0. systemd reads that as a clean shutdown and neither
      // restarts the unit nor marks it failed; podman reports the container
      // exited normally. So a first boot with no configuration, or a
      // configuration that became unreadable, looked exactly like a successful
      // deployment of a service that is not running.
      System.exit(1);

    } catch(Exception e) {
      // The throwable goes to slf4j rather than stderr. A bad config parameter
      // is a user error and its message says everything useful; anything else
      // gets its trace into the same log as the rest.
      if(e instanceof BadParamException || e instanceof MisconfigurationException)
        logger.error("Failed to properly launch: {}", e.getMessage());
      else
        logger.error("Failed to properly launch: {}", e.getMessage(), e);
      System.exit(1);
    }
    
  }

  /**
   * Retrieves the database driver.
   *
   * @return the {@link Database} instance
   */
  public static Database getDB() {
    return database;
  }

  /**
   * The build that is running.
   *
   * <p>Read from the jar manifest, which is the only place it can come from:
   * the artefact deliberately keeps a fixed name, so the filename says nothing.
   * Answers {@code "(dev)"} when there is no manifest, which is every run
   * straight from compiled classes -- a Gradle {@code run}, an IDE, the test
   * suite -- and which is honest rather than a lie about being some version.
   *
   * @return the version string, never {@code null}
   */
  public static String getVersion() {
    String version = YasssCore.class.getPackage().getImplementationVersion();
    return null == version || version.isBlank() ? "(dev)" : version;
  }

  /**
   * Whether the database is answering.
   *
   * <p>{@code GET /v1} is what a supervisor polls and what {@code e2e/run.sh}
   * waits on, and it used to read nothing but in-memory state -- so it stayed
   * green with a dead database while every endpoint that matters returned
   * {@code database malfunction}. "Ready" meant "the process is up", which is
   * the one thing a supervisor already knows.
   *
   * @return {@code true} if a trivial query round-trips within the deadline
   */
  public static boolean databaseHealthy() {
    return within(HEALTH_PROBE_TIMEOUT_MS, () -> {
      try(Connection con = database.connect();
          PreparedStatement stmt = con.prepareStatement("SELECT 1")) {
        stmt.executeQuery().close();
        return true;
      }
    });
  }

  /** How long the health probe waits before calling the database unavailable. */
  private static final long HEALTH_PROBE_TIMEOUT_MS = 2_000L;

  /**
   * Runs a probe under a deadline.
   *
   * <p>Bounded deliberately. The connection pool's own timeout is measured in
   * tens of seconds and is not configurable through {@code axb-lib-db}, so a
   * health check that simply waited on it would hang for half a minute before
   * reporting anything -- which is worse for a supervisor than the lie it
   * replaces, because a hung probe is indistinguishable from a slow one.
   *
   * <p>Any failure at all is unhealthy: an exception, a timeout, an
   * interruption. This is the one place where "I could not tell" and "no"
   * should mean the same thing.
   *
   * @param millis the deadline
   * @param probe the check to run
   * @return {@code true} only if the probe returned {@code true} in time
   */
  static boolean within(long millis, Callable<Boolean> probe) {
    // A daemon thread, so a probe still blocked on a dead socket cannot hold
    // the JVM open at shutdown.
    ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
      Thread t = new Thread(r, "health-probe");
      t.setDaemon(true);
      return t;
    });
    try {
      Future<Boolean> result = executor.submit(probe);
      try {
        return Boolean.TRUE.equals(result.get(millis, TimeUnit.MILLISECONDS));
      } catch(TimeoutException e) {
        result.cancel(true);
        return false;
      } catch(InterruptedException e) {
        Thread.currentThread().interrupt();
        return false;
      } catch(ExecutionException e) {
        logger.warn("health probe failed: {}", e.getCause().getMessage());
        return false;
      }
    } finally {
      executor.shutdownNow();
    }
  }

  /**
   * Retrieves the Stripe driver.
   *
   * @return the {@link StripeDriver} instance
   */
  public static StripeDriver getStripe() {
    return stripe;
  }

  /**
   * Retrieves the ticket engine.
   *
   * @return the {@link TicketEngine} instance
   */
  public static TicketEngine getTicketEngine() {
    return ticketEngine;
  }

  /**
   * Retrieves the UNIX epoch timestamp associated with the time during which
   * this program was executed.
   *
   * @return the launch time
   */
  public static long getLaunchTime() {
    return launchTime;
  }

  /**
   * Retrieves the CAPTCHA validator, if CAPTCHAs should be used in those
   * instances for which CAPTCHAs would normally be used.
   *
   * @return the {@link CAPTCHAValidator} instance, if CAPTCHAs have been enabled;
   *         otherwise, {@code null}
   */
  public static CAPTCHAValidator getCAPTCHAValidator() {
    return captchaValidator;
  }

  /**
   * Determines whether or not authentication is required under those
   * circumstances under which authentication might normally be required. In
   * cases where the frontend requires some form of user session, access is
   * granted at the admin level with any secret credential, so long as the user
   * has been properly identified.
   *
   * This method does not affect the CAPTCHA workflow requirement.
   *
   * @return {@code true} iff auth is required under standard circumstances
   */
  public static boolean authRequired() {
    return authRequired;
  }

  /**
   * Retrieves the expected API host. Mostly affects links in outgoing emails.
   *
   * @return the expected API host and protocol e.g. https://yasss.crowdease.com
   */
  public static String getAPIHost() {
    return apiHost;
  }

  /**
   * Determines whether or not debug logs should be enabled.
   * Note that this is mostly for the email workflow and frontend logs.
   *
   * @return {@code true} if debug logs are enabled
   */
  public static boolean debugEnabled() {
    return debugEnabled;
  }

  /**
   * The shortest password this deployment accepts when one is being set.
   *
   * <p>Advertised through {@code GET /v1} and applied by the client. It is not
   * enforceable here -- the password is never transmitted, only an Ed25519
   * public key derived from it -- so this is a policy the server publishes, not
   * a check it performs. Anyone building on this should read it that way.
   *
   * @return the minimum password length, in characters
   */
  public static int getPasswordMinLength() {
    return passwordMinLength;
  }

  /**
   * How long a session may go untouched before it must be re-established.
   *
   * @return {@code session.idleTimeout}, in milliseconds
   */
  /**
   * How far either side of now a credential's timestamp may sit.
   *
   * @return {@code auth.sigMaxSkew}, in milliseconds
   */
  /**
   * The resolved relying party, or {@code null} when passkeys are unavailable.
   *
   * <p>A {@code null} here is the single switch: it covers disabled-by-configuration and
   * cannot-be-resolved alike, because from every caller's point of view those are the same
   * thing.
   *
   * @return the relying party, or {@code null}
   */
  public static RelyingPartyConfig.Resolved getRelyingParty() {
    return relyingParty;
  }

  /**
   * The name an authenticator shows in its prompt.
   *
   * @return {@code passkey.rpName}
   */
  public static String getRelyingPartyName() {
    return relyingPartyName;
  }

  /**
   * How long a ceremony challenge stays good.
   *
   * @return {@code passkey.challengeTTL}, in milliseconds
   */
  public static long getPasskeyChallengeTTL() {
    return passkeyChallengeTTL;
  }

  public static long getSigMaxSkew() {
    return sigMaxSkew;
  }

  /**
   * The audience a credential must name.
   *
   * @return the resolved {@code auth.sigAudience}
   */
  public static String getSigAudience() {
    return sigAudience;
  }

  /**
   * Whether replayable v1 credentials are still honored.
   *
   * @return {@code auth.acceptLegacySig}
   */
  public static boolean acceptLegacySig() {
    return acceptLegacySig;
  }

  public static long getSessionIdleTimeout() {
    return sessionIdleTimeout;
  }

  /**
   * How long a session may live at all, however active.
   *
   * @return {@code session.absoluteTimeout}, in milliseconds
   */
  public static long getSessionAbsoluteTimeout() {
    return sessionAbsoluteTimeout;
  }

  /**
   * How long an emailed account-verification link stays good.
   *
   * @return {@code token.verifyTTL}, in milliseconds
   */
  public static long getVerifyTokenTTL() {
    return verifyTokenTTL;
  }

  /**
   * How long an emailed credential-reset link stays good.
   *
   * @return {@code token.resetTTL}, in milliseconds
   */
  public static long getResetTokenTTL() {
    return resetTokenTTL;
  }

  /**
   * A configuration that parses but cannot work.
   *
   * <p>Distinct from {@code Config.BadParamException}, which covers a value the config
   * layer could not read at all. This one is for a value that read fine and is still
   * wrong -- most usefully, one whose absence would produce a server that starts, passes
   * its health check, and cannot do its job.
   *
   * <p>Caught alongside {@code BadParamException} in {@link #main(String[])} and logged
   * without a stack trace, because the message is the entire useful content and a trace
   * would only bury it.</p>
   */
  public static class MisconfigurationException extends RuntimeException {

    /**
     * Instantiates a {@link MisconfigurationException}.
     *
     * @param message what is wrong, and what to set
     */
    public MisconfigurationException(String message) {
      super(message);
    }
  }

}
