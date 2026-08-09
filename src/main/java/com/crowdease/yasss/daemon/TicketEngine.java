/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.daemon;

import java.sql.SQLException;
import java.util.Deque;
import java.util.UUID;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.auth.CryptoException;
import com.crowdease.yasss.model.ConcurrentLinkedEvictionDeque;
import com.crowdease.yasss.model.TicketSigner;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class TicketEngine implements Runnable {

  private static final Logger logger = LoggerFactory.getLogger(TicketEngine.class);

  /**
   * The most signers kept, whatever the configuration works out to.
   *
   * <p>Purely a bound on memory and on rows written per day. It is not a
   * security parameter and it does not affect the cost of verifying anything:
   * a ticket names the signer that signed it, so verification is a lookup and
   * one Ed25519 check regardless of how many are held.
   */
  static final int MAX_SIGNERS = 256;

  /**
   * A signature together with the signer that produced it.
   *
   * <p>Returned as a pair rather than fetched in two calls, because between the
   * two the engine could rotate and the caller would name the wrong key.
   *
   * @param signerID the signer's {@link UUID}, quoted in the ticket
   * @param value the base64 signature
   */
  public static record Signature(UUID signerID, String value) { }

  /**
   * Works out how many signers to hold.
   *
   * <p>The naive reading of {@code ticket.*} is that a session survives
   * {@code refreshInterval x maxHistory}, and the shipped pair used to make that
   * fifteen minutes. Persisting the signers does nothing on its own if they are
   * still evicted a quarter of an hour later, and the symptom -- sessions dying
   * early despite {@code session.absoluteTimeout} promising thirty days -- looks
   * exactly like the persistence not working.
   *
   * <p>So retention is derived rather than configured: enough signers to cover
   * whichever is longer, the configured history or the absolute session
   * timeout. What {@code ticket.*} still means is rotation cadence and the
   * floor on key retention.
   *
   * <p>Clamped rather than honored without limit, because a deployment pinning
   * {@code refreshInterval: 1} would otherwise ask for one signer per minute for
   * thirty days. When the clamp bites, the caller warns and says what to change.
   *
   * @param refreshIntervalMinutes minutes between rotations
   * @param maxHistory the configured floor on signers retained
   * @param absoluteTimeoutMinutes {@code session.absoluteTimeout}
   * @return the number of signers to hold, never above {@link #MAX_SIGNERS}
   */
  static int signerCount(int refreshIntervalMinutes, int maxHistory, long absoluteTimeoutMinutes) {
    long retention = Math.max((long)refreshIntervalMinutes * maxHistory, absoluteTimeoutMinutes);
    // Ceiling division: a partial interval at the end still needs a key.
    long count = (retention + refreshIntervalMinutes - 1) / refreshIntervalMinutes;
    return (int)Math.max(1L, Math.min(count, MAX_SIGNERS));
  }

  private final Deque<Credentialed> signers;
  private final long refreshInterval;
  private final long retentionMillis;
  private final boolean persistent;
  private final int capacity;

  private Thread thread = null;

  /**
   * Instantiates the ticket engine--the daemon responsible for generating and
   * verifying session signing keys.
   *
   * @param refreshInterval the number of minutes between generations of the
   *        signing key
   * @param maxHistory the number of signing keys to retain in history before
   *        invalidating the oldest key
   * @param absoluteTimeoutMinutes the longest a session may live, which sets the
   *        floor on how long a signer must be kept
   * @param persistent whether signers may be written to the database; see
   *        {@link TicketSigner#persistenceAllowed(String)}
   * @throws IllegalArgumentException if either the refresh interval or validity
   *         window are non-positive
   */
  public TicketEngine(
      int refreshInterval, int maxHistory, long absoluteTimeoutMinutes, boolean persistent) {
    if(0 >= refreshInterval || 0 >= maxHistory)
      throw new IllegalArgumentException("invalid arguments for TicketEngine");

    this.capacity = signerCount(refreshInterval, maxHistory, absoluteTimeoutMinutes);
    this.refreshInterval = refreshInterval * 60 * 1000L; // milliseconds in a minute
    this.retentionMillis = (long)capacity * this.refreshInterval;
    this.persistent = persistent;
    this.signers = new ConcurrentLinkedEvictionDeque<>(capacity);

    long covered = (long)capacity * refreshInterval;
    if(covered < absoluteTimeoutMinutes)
      logger.warn(
          "ticket.refreshInterval is {} minute(s), so the {} signers this engine will hold "
          + "cover only {} minute(s) of session history -- sessions will expire after that "
          + "rather than after session.absoluteTimeout ({} minutes). Raise "
          + "ticket.refreshInterval.",
          refreshInterval,
          capacity,
          covered,
          absoluteTimeoutMinutes);

    if(!persistent)
      logger.warn(
          "ticket.globalSecret is unset or still the shipped placeholder, so signing keys "
          + "are kept in memory only and every restart will sign out every user. Set a real "
          + "secret to persist them; they are stored encrypted under it, and writing them "
          + "without one would put raw signing keys in the database.");
  }

  /**
   * {@inheritDoc}
   */
  @Override public void run() {
    try {
      // Sleeps first. The initial signer is minted synchronously by start(),
      // which is what stops sign() from being reachable before the deque has
      // anything in it -- a race that used to answer with a RuntimeException on
      // whichever request happened to arrive first after a boot.
      while(!thread.isInterrupted()) {
        Thread.sleep(refreshInterval);
        rotate();
      }
    } catch(InterruptedException e) { }

    logger.warn("TicketEngine terminated");
    thread = null;
  }

  /**
   * Starts the ticket engine if it has not yet been started.
   */
  public void start() {
    if(null != thread) return;

    if(persistent) {
      try {
        var restored = TicketSigner.load(capacity);
        signers.addAll(restored);
        logger.info("restored {} signer(s) from the database", restored.size());
      } catch(SQLException e) {
        logger.error("could not restore stored signers: {}", e.getMessage(), e);
      }
    }

    // Only when there is nothing to sign with. A restored signer is a perfectly
    // good one, and minting on every boot would burn through the history for no
    // reason.
    if(signers.isEmpty()) rotate();

    thread = new Thread(this);
    thread.setDaemon(true);
    thread.start();
  }

  /**
   * Stops the ticket engine if it was started.
   */
  public void stop() {
    if(null != thread) thread.interrupt();
  }

  /**
   * Generates a signer, adds it to the history and persists it.
   */
  private void rotate() {
    Credentialed signer = new Credentialed(UUID.randomUUID(), null, null, null);

    try {
      signer.regenerateKeypair();
    } catch(CryptoException e) {
      // Returns rather than falling through. A signer whose keypair failed to
      // generate has a null private key: it signs nothing, verifies nothing, and
      // used to be added to the history anyway, where it displaced a working one
      // and became the head that sign() reaches for.
      logger.error("failed to generate signer: {}", e.getMessage(), e);
      return;
    }

    signers.add(signer);

    if(persistent) {
      try {
        long now = System.currentTimeMillis();
        TicketSigner.store(signer, now);
        TicketSigner.prune(now - retentionMillis);
      } catch(SQLException e) {
        // Not fatal: the signer is already in memory and works for this process.
        // What is lost is its survival across a restart.
        logger.error("could not persist signer {}: {}", signer.getID(), e.getMessage(), e);
      }
    }

    logger.info("generated new signer {}", signer.getID());
  }

  /**
   * Discards every signer, stored and in memory, and mints a fresh one.
   *
   * <p>Half of a platform-wide revocation; the other half is bumping every
   * account's {@code session_epoch}, which is what makes it immediate. This part
   * makes it survive a restart.
   *
   * @throws SQLException if the stored signers could not be removed
   */
  public void reset() throws SQLException {
    if(persistent) TicketSigner.wipe();
    signers.clear();
    rotate();
    logger.warn("ticket signers were reset; every existing session is now invalid");
  }

  /**
   * Signs a message with the most recently-generated signer key.
   *
   * @param message the message to sign
   * @return the {@link Signature}, naming the signer that produced it
   * @throws CryptoException if the message couldn't be signed
   */
  public Signature sign(String message) throws CryptoException {
    Credentialed signer = signers.peekLast();
    if(null == signer)
      throw new CryptoException("signer queue has not yet been populated", null);
    return new Signature(signer.getID(), signer.sign(message));
  }

  /**
   * Verifies that a message was signed by one of this engine's signers.
   *
   * <p>The ticket names its signer, so this is a lookup and a single Ed25519
   * check rather than a scan of the whole history. That decoupling is what lets
   * the history be sized by how long a session may live rather than by how much
   * work a bad signature is allowed to cost.
   *
   * @param message the message that was signed
   * @param signature the message signature
   * @param signerID the signer named by the ticket, which may be {@code null}
   *        for a ticket issued before signers were named
   * @return {@code true} iff the signature is valid and verified
   */
  public boolean verify(String message, String signature, UUID signerID) {
    if(null == signerID || null == signature) return false;
    for(var signer : signers)
      if(signerID.equals(signer.getID()))
        return signer.verifySig(message, signature);
    return false;
  }

  /**
   * Waits briefly for the worker to finish after {@link #stop()}.
   *
   * <p>{@code stop()} only interrupts, and the thread is a daemon, so without
   * this the JVM exits out from under whatever it was doing.
   *
   * @param millis how long to wait
   */
  public void join(long millis) {
    Thread t = thread;
    if(null == t) return;
    try {
      t.join(millis);
    } catch(InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
