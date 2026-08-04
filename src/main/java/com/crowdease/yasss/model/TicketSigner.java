/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.db.SQLBuilder;
import com.axonibyte.lib.db.Comparison.ComparisonOp;
import com.axonibyte.lib.db.SQLBuilder.Order;
import com.crowdease.yasss.YasssCore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Persistence for the {@code TicketEngine}'s signing keys.
 *
 * <p>A signer is an ordinary {@link Credentialed} whose id, public key and
 * <em>encrypted</em> private key round-trip through the database, so a session
 * signed before a restart still verifies after it.
 *
 * <p>Two properties of {@link Credentialed} govern everything here, and both are
 * covered by {@code TicketSignerCodecTest}:
 *
 * <ol>
 *   <li>The private key is AES-GCM encrypted using <em>the signer's own
 *       {@link UUID} as the IV</em>. Restore a signer under any other id and the
 *       GCM tag fails. The symptom is not an exception anywhere useful: the
 *       signer simply stops verifying, {@code AuthToken} reports a failure,
 *       {@code APIEndpoint.authenticate} swallows it, and every caller quietly
 *       becomes anonymous. So ids are preserved exactly and every restored
 *       signer is probed before it is trusted.</li>
 *   <li>When no global secret is configured, {@code Credentialed}'s crypto
 *       helper returns its input unchanged. The default <em>is</em> no secret,
 *       and the shipped configuration file carries a placeholder. Persisting
 *       under either would write raw Ed25519 signing keys into a table, and
 *       anyone with read access to one table could mint a session for any
 *       account. {@link #persistenceAllowed(String)} is what stops that, and it
 *       is checked before anything is written rather than after.</li>
 * </ol>
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class TicketSigner {

  private static final Logger logger = LoggerFactory.getLogger(TicketSigner.class);

  /**
   * Every placeholder {@code defaults/yasss.cfg} has ever carried.
   *
   * <p>{@code YasssCore} copies that file to disk on first boot, so one of these
   * is the value a deployment has if nobody edited it. They are in the public
   * source tree, which makes them exactly as good as no secret at all.
   *
   * <p>The list is cumulative on purpose: retiring an old placeholder from it
   * would silently start accepting the very deployments that never changed it.
   */
  private static final Set<String> PLACEHOLDER_SECRETS = Set.of(
      "myGlobalSecret1!",
      "CHANGE-ME-to-a-long-random-string");

  /**
   * Whether signing keys may be written to the database under this secret.
   *
   * <p>Refuses null, blank, and the shipped placeholder. There is deliberately
   * no override: the failure mode is silent plaintext key storage, which nobody
   * would notice, so the only safe default is to keep the keys in memory and say
   * so loudly.
   *
   * @param secret the configured {@code ticket.globalSecret}
   * @return {@code true} if signers may be persisted
   */
  public static boolean persistenceAllowed(String secret) {
    return null != secret
        && !secret.isBlank()
        && !PLACEHOLDER_SECRETS.contains(secret);
  }

  /**
   * Loads the most recently generated signers, oldest first.
   *
   * <p>Oldest first so that the caller can add them to the engine's deque in
   * order and have {@code peekLast()} yield the newest, which is what signs.
   *
   * <p>A signer whose keys do not survive the round trip is dropped with a
   * complaint rather than returned. Left in place it would verify nothing and
   * look like an expired session to every affected user.
   *
   * @param limit the most signers to return
   * @return the signers, oldest first; never {@code null}
   * @throws SQLException if a database malfunction occurs
   */
  public static List<Credentialed> load(int limit) throws SQLException {
    if(1 > limit) return List.of();

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "ticket_signer",
                  "id",
                  "pubkey",
                  "privkey")
              .order("created_at", Order.DESC)
              .limit(limit)
              .toString());
      res = stmt.executeQuery();

      List<Credentialed> signers = new ArrayList<>();
      while(res.next()) {
        UUID id = SQLBuilder.bytesToUUID(res.getBytes("id"));
        Credentialed signer = new Credentialed(
            id,
            res.getBytes("pubkey"),
            res.getBytes("privkey"),
            null);
        if(usable(signer)) signers.add(signer);
        else logger.warn(
            "discarding stored signer {}: it does not sign and verify. "
            + "ticket.globalSecret has most likely changed; sessions issued "
            + "under the old one cannot be recovered",
            id);
      }

      // Newest first out of the database so LIMIT takes the right end; reversed
      // here so the caller can append them in age order.
      Collections.reverse(signers);
      return signers;

    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
  }

  /**
   * Signs and verifies a known message with a signer to prove it works.
   *
   * <p>This is what catches a signer restored under the wrong id, or decrypted
   * with the wrong secret. Both fail here rather than at three in the morning
   * when everybody is mysteriously signed out.
   *
   * @param signer the {@link Credentialed} to probe
   * @return {@code true} if it round-trips a signature
   */
  static boolean usable(Credentialed signer) {
    try {
      final String probe = "ticket-signer-probe";
      return signer.verifySig(probe, signer.sign(probe));
    } catch(Exception e) {
      // Deliberately Exception: a bad GCM tag surfaces as a CryptoException, a
      // truncated key as an IllegalArgumentException from Bouncy Castle, and
      // neither is more recoverable than the other.
      return false;
    }
  }

  /**
   * Writes a signer to the database.
   *
   * @param signer the {@link Credentialed} to store
   * @param createdAt the epoch millisecond at which it was generated
   * @throws SQLException if a database malfunction occurs
   */
  public static void store(Credentialed signer, long createdAt) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .insert(
                  YasssCore.getDB().getPrefix() + "ticket_signer",
                  "id",
                  "pubkey",
                  "privkey",
                  "created_at")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(signer.getID()));
      stmt.setBytes(2, signer.getPubkey());
      stmt.setBytes(3, signer.getEncPrivkey());
      stmt.setLong(4, createdAt);
      stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Deletes signers generated before a cutoff.
   *
   * @param cutoff the epoch millisecond before which signers are no longer
   *        needed
   * @return the number of signers removed
   * @throws SQLException if a database malfunction occurs
   */
  public static int prune(long cutoff) throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "ticket_signer")
              .where("created_at", ComparisonOp.LESS_THAN)
              .toString());
      stmt.setLong(1, cutoff);
      return stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  /**
   * Deletes every stored signer.
   *
   * <p>Half of a platform-wide session revocation. On its own it is not
   * immediate -- a running process still holds its own signers in memory -- so
   * the caller pairs it with a bump of every {@code session_epoch}, which is.
   * What this adds is that the wipe survives a restart.
   *
   * @return the number of signers removed
   * @throws SQLException if a database malfunction occurs
   */
  public static int wipe() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "ticket_signer")
              .toString());
      return stmt.executeUpdate();

    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  private TicketSigner() { }

}
