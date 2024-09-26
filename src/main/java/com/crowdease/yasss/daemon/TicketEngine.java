/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.daemon;

import java.util.Deque;
import java.util.UUID;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.auth.CryptoException;
import com.crowdease.yasss.model.ConcurrentLinkedEvictionDeque;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class TicketEngine implements Runnable {

  private static final Logger logger = LoggerFactory.getLogger(TicketEngine.class);

  private Deque<Credentialed> signers;
  private Thread thread = null;
  private long refreshInterval;

  /**
   * Instantiates the ticket engine--the daemon responsible for generating and
   * verifying one-time passwords.
   *
   * @param refreshInterval the number of minutes between generations of the
   *        signing key
   * @param maxHistory the number of signing keys to retain in history before
   *        invalidating the oldest key
   * @throws IllegalArgumentException if either the refresh interval or validity
   *         window are non-positive
   */
  public TicketEngine(int refreshInterval, int maxHistory) {
    if(0 >= refreshInterval || 0 >= maxHistory)
      throw new IllegalArgumentException("invalid arguments for TicketEngine");
    this.refreshInterval = refreshInterval * 60 * 1000L; // milliseconds in a minute
    this.signers = new ConcurrentLinkedEvictionDeque<>(maxHistory);
  }

  @Override public void run() {
    try {
      while(!thread.isInterrupted()) {
        Credentialed signer = new Credentialed(UUID.randomUUID(), null, null, null);
        try {
          signer.regenerateKeypair();
        } catch(CryptoException e) {
          logger.error("Failed to generate signer: {}", e.getMessage());
          e.printStackTrace();
        }
        signers.add(signer);
        
        Thread.sleep(refreshInterval);
      }
    } catch(InterruptedException e) { }
    
    logger.warn("TicketEngine terminated.");
    thread = null;
  }

  public void start() {
    if(null == thread) {
      thread = new Thread(this);
      thread.setDaemon(true);
      thread.start();
    }
  }

  public void stop() {
    if(null != thread) thread.interrupt();
  }

  public String sign(String message) throws CryptoException {
    Credentialed signer = signers.peekLast();
    if(null == signer)
      throw new RuntimeException("Signer queue has not yet been populated!");
    return signer.sign(message);
  }

  public boolean verify(String message, String signature) {
    for(var signer : signers)
      if(signer.verifySig(message, signature))
         return true;
    return false;
  }
  
}
