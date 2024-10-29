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
import java.util.AbstractMap.SimpleEntry;
import java.util.Map.Entry;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.cfg.CLConfig;
import com.axonibyte.lib.cfg.Config;
import com.axonibyte.lib.cfg.FileConfig;
import com.axonibyte.lib.cfg.Config.BadParamException;
import com.axonibyte.lib.cfg.FileConfig.FileReadException;
import com.axonibyte.lib.db.Database;
import com.axonibyte.lib.http.APIDriver;
import com.axonibyte.lib.http.captcha.CAPTCHAValidator;
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
import com.crowdease.yasss.api.RemoveActivityEndpoint;
import com.crowdease.yasss.api.RemoveDetailEndpoint;
import com.crowdease.yasss.api.RemoveEventEndpoint;
import com.crowdease.yasss.api.RemoveUserEndpoint;
import com.crowdease.yasss.api.RemoveVolunteerEndpoint;
import com.crowdease.yasss.api.RemoveWindowEndpoint;
import com.crowdease.yasss.api.ResetUserEndpoint;
import com.crowdease.yasss.api.RetrieveEventEndpoint;
import com.crowdease.yasss.api.SetRSVPEndpoint;
import com.crowdease.yasss.api.SetSlotEndpoint;
import com.crowdease.yasss.api.UnsetRSVPEndpoint;
import com.crowdease.yasss.api.UnsetSlotEndpoint;
import com.crowdease.yasss.api.VerifyUserEndpoint;
import com.crowdease.yasss.config.ParamEnum;
import com.crowdease.yasss.daemon.TicketEngine;

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
  private static boolean authRequired = true;

  /**
   * Entry-point.
   *
   * @param args command-line arguments
   */
  public static void main(String[] args) {

    logger.info("Hello, world!");

    try {

      config = new CLConfig();
      for(var param : ParamEnum.values())
      config.defineParam(param.param());
      ((CLConfig)config).loadArgs(args);

      try {
        FileConfig fCfg = new FileConfig(
            config.getString(ParamEnum.CONFIG_FILE.param().toString()));
        for(var param : ParamEnum.values())
          if(ParamEnum.CONFIG_FILE != param)
            fCfg.defineParam(param.param());
        fCfg.load();
        config = fCfg.merge(config);
      } catch(BadParamException e) {
        logger.warn("No configuration file specified.");
      }

      database = new Database(
          config.getString(ParamEnum.DB_LOCATION.param().toString()),
          config.getString(ParamEnum.DB_PREFIX.param().toString()),
          config.getString(ParamEnum.DB_USERNAME.param().toString()),
          config.getString(ParamEnum.DB_PASSWORD.param().toString()),
          config.getBoolean(ParamEnum.DB_SECURE.param().toString()));
      database.setup(YasssCore.class, "db");

      Credentialed.setGlobalSecret(
          config.getString(
              ParamEnum.TICKET_GLOBAL_SECRET.param().toString()));

      authRequired = config.getBoolean(ParamEnum.AUTH_REQUIRE_SIGNIN.param().toString());

      if(config.getBoolean(ParamEnum.AUTH_CAPTCHA_REQUIRED.param().toString()))
        captchaValidator = new CAPTCHAValidator(
            config.getString(ParamEnum.AUTH_CAPTCHA_KEYFILE.param().toString()),
            config.getString(ParamEnum.AUTH_CAPTCHA_CLOUD_PROJECT.param().toString()),
            config.getString(ParamEnum.AUTH_CAPTCHA_SITE_KEY.param().toString()));

      ticketEngine = new TicketEngine(
          config.getInteger(ParamEnum.TICKET_REFRESH_INTERVAL.param().toString()),
          config.getInteger(ParamEnum.TICKET_MAX_HISTORY.param().toString()));
      ticketEngine.start();

      apiDriver = new APIDriver.Builder()
          .setPort(
              config.getInteger(
                  ParamEnum.API_PORT.param().toString()))
          .setPublicFolder("/public")
          .addAllowedOrigins(
              config.getString(
                  ParamEnum.API_ALLOWED_ORIGINS.param().toString()))
          .addExposedHeaders(
              APIEndpoint.ACCOUNT_HEADER,
              APIEndpoint.SESSION_HEADER)
          .addEndpoints(
              new APIInfoEndpoint(),
              new AddActivityEndpoint(),
              new AddDetailEndpoint(),
              new AddVolunteerEndpoint(),
              new AddWindowEndpoint(),
              new CreateEventEndpoint(),
              new CreateUserEndpoint(),
              new EventReportEndpoint(),
              new ListEventsEndpoint(),
              new ListUsersEndpoint(),
              new ModifyActivityEndpoint(),
              new ModifyDetailEndpoint(),
              new ModifyEventEndpoint(),
              new ModifyUserEndpoint(),
              new ModifyVolunteerEndpoint(),
              new ModifyWindowEndpoint(),
              new RemoveActivityEndpoint(),
              new RemoveDetailEndpoint(),
              new RemoveEventEndpoint(),
              new RemoveUserEndpoint(),
              new RemoveVolunteerEndpoint(),
              new RemoveWindowEndpoint(),
              new ResetUserEndpoint(),
              new RetrieveEventEndpoint(),
              new SetRSVPEndpoint(),
              new SetSlotEndpoint(),
              new UnsetRSVPEndpoint(),
              new UnsetSlotEndpoint(),
              new VerifyUserEndpoint())
          .build();

      Runtime.getRuntime().addShutdownHook(new Thread() {
        @Override public void run() {
          logger.info("Shutting down...");
          apiDriver.halt();
          ticketEngine.stop();
          logger.info("Goodbye! ^_^");
        }
      });

    } catch(FileReadException e) {
      
      File diskConfig = new File(
          config.getString(ParamEnum.CONFIG_FILE.param().toString()));

      if(diskConfig.exists()) {
        logger.error("Failed to read config file: {}", e.getMessage());
      } else {
        try {
          Files.copy(
              YasssCore.class.getResourceAsStream("/yasss.cfg"),
              Paths.get(diskConfig.toURI()));
          logger.warn("Saved default config file. Please modify and try again!");
        } catch(IOException e2) {
          logger.error("Failed to save the default config file: {}", e2.getMessage());
        }
      }
      
    } catch(Exception e) {
      logger.error("Failed to properly launch: {}", e.getMessage());
      if(!(e instanceof BadParamException))
        e.printStackTrace();
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

}
