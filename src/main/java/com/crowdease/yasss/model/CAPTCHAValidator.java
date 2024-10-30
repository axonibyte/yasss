/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Wrapper for Axonibyte's CAPTCHA Validator that additionally handles IP
 * caching and score evaluation.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class CAPTCHAValidator extends com.axonibyte.lib.http.captcha.CAPTCHAValidator {

  private static final Logger logger = LoggerFactory.getLogger(CAPTCHAValidator.class);
  
  private final Map<String, Thread> ipCache = new ConcurrentHashMap<>();
  private final float minScore;
  private final long gracePeriod;

  /**
   * Instantiates the CAPTCHA validator.
   *
   * @param credsFile the path to the credentials JSON file associated with the
   *        service account
   * @param projectID the Google Cloud project ID associated with the service
   *        account
   * @param siteKey the reCAPTCHA site key
   * @param minScore the minimum score (between 0 and 1) that users must score
   *        in order to be considered legitimately human
   * @param gracePeriod the number of milliseconds after a successful verification
   *        during which the user will be automatically assumed legitimate for
   *        subsequent requests
   * @throws IOException if the credentials could not be read
   */
  public CAPTCHAValidator(String credsFile, String projectID, String siteKey, float minScore, long gracePeriod) throws IOException {
    super(credsFile, projectID, siteKey);
    this.minScore = minScore;
    this.gracePeriod = gracePeriod;
  }

  /**
   * Verifies the token provided in the reCAPTCHA response after a user submits
   * their CAPTCHA challenge.
   *
   * @param token the token returned by the reCAPTCHA service
   * @param action the specified action passed alongside the challenge (optional)
   * @param ip the IP address of the remote user (optional)
   * @return {@code true} if it is likely that the user is an authentic human;
   *         {@code false} if it is likely that the user is a bot
   */
  public boolean verify(String token, String action, String ip) {
    if(null != ip && ipCache.containsKey(ip)) {
      logger.info(
          "user's ip ({}) found in cache; verification is not necessary (this time)",
          ip);
      return true;
    }

    if(null == token) return false;

    boolean pass = minScore <= score(token, action, ip);
    logger.info(
        "user at {} has {} the CAPTCHA verification",
        ip,
        pass ? "PASSED" : "FAILED");
    
    if(pass && null != ip) {
      Thread thread = new Thread(new CacheReaper(ip));
      thread.setDaemon(true);
      ipCache.put(ip, thread);
      thread.start();
      
      logger.info(
          "cached IP {} for {} milliseconds",
          ip,
          gracePeriod);
    }
    
    return pass;
  }

  private class CacheReaper implements Runnable {

    private String ip;

    private CacheReaper(String ip) {
      this.ip = ip;
    }

    @Override public void run() {
      try {
        Thread.sleep(gracePeriod);
        ipCache.remove(ip);
        logger.info(
            "cached IP {} has expired",
            ip);
      } catch(InterruptedException e) { }
    }
    
  }
  
}
