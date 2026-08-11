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

    /**
     * Decide from what the assessment actually said.
     *
     * <p>A policy-based key reports a verdict; a checkbox or score-based key
     * reports {@code UNSPECIFIED} and a score. Reading whichever arrived is
     * safe here in a way that inference usually is not, because <em>both
     * branches are gates</em> -- guessing wrong applies the other check, never
     * no check. The worst case is a policy-based key being scored against
     * {@code minScore}, which is stricter than intended rather than laxer.
     *
     * <p>The default, so a deployment need not know which kind of key it was
     * handed, and does not break if somebody swaps it for the other.
     */
    AUTO,

    /** Always reads {@code minScore} against the risk score. */
    CHECKBOX,

    /** Always reads the policy engine's verdict and ignores {@code minScore}. */
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
   * <p>Under {@link KeyType#POLICY_BASED}, {@code UNSPECIFIED} fails closed:
   * the key was declared to be one that decides, so nothing deciding is a
   * misconfiguration rather than a pass. Under {@link KeyType#AUTO} the same
   * response falls through to the score instead, because nothing was declared
   * and a score is still a gate.
   *
   * @param verdict what the assessment said
   * @return {@code true} iff the caller should be treated as human
   */
  private boolean passes(Verdict verdict) {
    if(!verdict.tokenValid()) return false;

    return switch(keyType) {
      case POLICY_BASED -> policyPasses(verdict);
      case CHECKBOX -> minScore <= verdict.score();

      // The verdict when there is one, the score when there is not. A key that
      // decided something has already applied thresholds configured against it,
      // and second-guessing that with a local number would override the very
      // thing the key type exists to provide.
      case AUTO -> Challenge.UNSPECIFIED == verdict.challenge()
          ? minScore <= verdict.score()
          : policyPasses(verdict);
    };
  }

  /**
   * Whether a policy engine's verdict is a pass.
   *
   * <p>{@code NOCAPTCHA} is a pass and not a gap: it means the engine looked at
   * the request and chose not to challenge, which is the answer this key type
   * exists to give. Anything else -- including a value this build does not
   * recognise -- is not.
   *
   * @param verdict what the assessment said
   * @return {@code true} iff the policy engine was satisfied
   */
  private static boolean policyPasses(Verdict verdict) {
    return Challenge.PASSED == verdict.challenge() || Challenge.NOCAPTCHA == verdict.challenge();
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
