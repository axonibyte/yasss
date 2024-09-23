/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss;

import com.axonibyte.lib.cfg.CLConfig;
import com.axonibyte.lib.db.Database;
import com.axonibyte.lib.http.APIDriver;
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

  private static APIDriver apiDriver = null;
  private static Database database = null;
  private static TicketEngine ticketEngine = null;

  /**
   * Entry-point.
   *
   * @param args command-line arguments
   */
  public static void main(String[] args) {

    logger.info("Hello, world!");

    var config = new CLConfig();
    for(var param : ParamEnum.values())
      config.defineParam(param.param());

    try {
      config.loadArgs(args);

      database = new Database(
          config.getString(ParamEnum.DB_LOCATION.param().toString()),
          config.getString(ParamEnum.DB_PREFIX.param().toString()),
          config.getString(ParamEnum.DB_USERNAME.param().toString()),
          config.getString(ParamEnum.DB_PASSWORD.param().toString()),
          config.getBoolean(ParamEnum.DB_SECURE.param().toString()));
      database.setup(YasssCore.class, "db");

      ticketEngine = new TicketEngine(
          config.getInteger(ParamEnum.TICKET_REFRESH_INTERVAL.toString()),
          config.getInteger(ParamEnum.TICKET_MAX_HISTORY.toString()));
      ticketEngine.start();

      apiDriver = APIDriver.build(
          config.getInteger(ParamEnum.API_PORT.param().toString()),
          config.getString(ParamEnum.API_ALLOWED_ORIGINS.param().toString()),
          null);

      Runtime.getRuntime().addShutdownHook(new Thread() {
        @Override public void run() {
          logger.info("Shutting down...");
          apiDriver.halt();
          ticketEngine.stop();
          logger.info("Goodbye! ^_^");
        }
      });
      
    } catch(Exception e) {
      logger.error("Failed to properly launch: {}", e.getMessage());
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

}
