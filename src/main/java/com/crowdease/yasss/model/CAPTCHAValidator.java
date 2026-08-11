/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.axonibyte.lib.http.captcha.CAPTCHAValidator.Challenge;
import com.axonibyte.lib.http.captcha.CAPTCHAValidator.Credential;
import com.axonibyte.lib.http.captcha.CAPTCHAValidator.Verdict;

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

  /**
   * How a key's verdict is to be read.
   *
   * <p>The two are not interchangeable. A checkbox key answers with a risk
   * score and expects the caller to pick a threshold; a policy-based challenge
   * key has already applied thresholds configured against the key and answers
   * with what it decided. Reading one as the other either ignores a decision
   * that was made or invents one that was not.
   *
   * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
   */
  public static enum KeyType {

    /** Reads {@code minScore} against the risk score. */
    CHECKBOX,

    /** Reads the policy engine's verdict and ignores {@code minScore}. */
    POLICY_BASED
  }

  private final ExecutorService threadPool = Executors.newCachedThreadPool();
  private final Set<String> ipCache = new CopyOnWriteArraySet<>();
  private final KeyType keyType;
  private final float minScore;
  private final long gracePeriod;

  /**
   * Instantiates the CAPTCHA validator.
   *
   * @param credential whether {@code secret} is a credentials file or an API key
   * @param secret the path to a credentials JSON file, or the API key itself
   * @param projectID the Google Cloud project ID
   * @param siteKey the reCAPTCHA site key
   * @param keyType how this key's verdict is to be read
   * @param minScore the minimum score (between 0 and 1) that users must score
   *        on a {@link KeyType#CHECKBOX} key; ignored on a policy-based one
   *        in order to be considered legitimately human
   * @param gracePeriod the number of milliseconds after a successful verification
   *        during which the user will be automatically assumed legitimate for
   *        subsequent requests
   * @throws IOException if the credentials could not be read
   */
  public CAPTCHAValidator(Credential credential, String secret, String projectID, String siteKey, KeyType keyType, float minScore, long gracePeriod) throws IOException {
    super(credential, secret, projectID, siteKey);
    this.keyType = keyType;
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
    if(null != ip && ipCache.contains(ip)) {
      logger.info(
          "user's ip ({}) found in cache; verification is not necessary (this time)",
          ip);
      return true;
    }

    if(null == token) return false;

    boolean pass = passes(assess(token, action, ip));
    logger.info(
        "user at {} has {} the CAPTCHA verification",
        ip,
        pass ? "PASSED" : "FAILED");
    
    if(pass && null != ip) {
      ipCache.add(ip);
      threadPool.execute(new CacheReaper(ip));
      
      logger.info(
          "cached IP {} for {} milliseconds",
          ip,
          gracePeriod);
    }
    
    return pass;
  }

  /**
   * Decides whether a verdict clears this key's bar.
   *
   * <p>On a policy-based key, {@code NOCAPTCHA} is a pass and not a gap: it
   * means the policy engine looked at the request and chose not to challenge,
   * which is the answer the whole key type exists to give. {@code UNSPECIFIED}
   * is not, because it means nothing decided anything -- which on a key
   * configured as policy-based is a misconfiguration, and failing closed is the
   * only safe reading of it.
   *
   * @param verdict what the assessment said
   * @return {@code true} iff the caller should be treated as human
   */
  private boolean passes(Verdict verdict) {
    if(!verdict.tokenValid()) return false;

    return switch(keyType) {
      case POLICY_BASED ->
          Challenge.PASSED == verdict.challenge() || Challenge.NOCAPTCHA == verdict.challenge();
      case CHECKBOX -> minScore <= verdict.score();
    };
  }

  /**
   * {@inheritDoc}
   */
  @Override public void close() {
    threadPool.shutdownNow();
    super.close();
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
