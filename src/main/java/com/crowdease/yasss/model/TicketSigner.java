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
 * covered by {@code TicketSignerCodecTest}. <b>Both changed at
 * {@code axb-lib-auth-java} 0.1.0</b>, and the old statements of them are kept below
 * because rows written under the old behavior are still in the table:
 *
 * <ol>
 *   <li>The private key is AES-GCM encrypted under {@code ticket.globalSecret} with a
 *       <em>random nonce per record</em>, carried inside the stored blob. The signer's
 *       {@link UUID} is no longer key material, so a signer restored under the wrong id
 *       now decrypts perfectly well.
 *
 *       <p>Ids are still preserved exactly, but for a different reason: a session ticket
 *       names the signer that produced it and {@link com.crowdease.yasss.daemon.TicketEngine#verify}
 *       resolves it by id. What changed is where a mistake is caught. It used to be
 *       {@link #load(int)}, incidentally, because a wrong id failed the GCM tag; it is now
 *       {@code TicketEngineKidTest}, deliberately.
 *
 *       <p>Rows written before that change <em>are</em> keyed to the id -- the legacy
 *       format derives the IV from it -- and the library reads both formats, so the
 *       upgrade does not invalidate them. {@link CredentialMigrator} does not sweep this
 *       table; see its javadoc for why.</li>
 *   <li>When no global secret is configured, {@code Credentialed} refuses to generate or
 *       encrypt a key at all, rather than returning its input unchanged. Raw Ed25519
 *       signing keys can therefore no longer reach this table by that route -- the
 *       process fails before it has a key to write, and {@code YasssCore} refuses to boot
 *       without a secret in any case.
 *
 *       <p>{@link #persistenceAllowed(String)} now guards a different hazard, and still
 *       earns its keep: the shipped placeholder is a <em>real</em> secret, so a signer
 *       encrypted under it is genuinely encrypted -- under a key that is in the public
 *       source tree. To anyone holding that tree it is as good as plaintext.</li>
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
   * <p>Refuses null, blank, and the shipped placeholder. There is deliberately no
   * override.
   *
   * <p>The null and blank cases are now unreachable in practice, because {@code YasssCore}
   * refuses to boot without a secret at all -- kept anyway, since this is a public static
   * a future caller may reach without going through {@code main}, and a method asked "may
   * these go to disk" should answer for every input rather than assume its caller checked.
   *
   * <p>The placeholder case is what carries the method now. A signer encrypted under
   * {@code "CHANGE-ME-to-a-long-random-string"} is genuinely encrypted -- under a key
   * printed in the public source tree, which makes it as good as plaintext to anyone
   * holding a checkout. That used to be a figure of speech and is now literally accurate.
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
   * look like an expired session to every affected user. Three things now reach
   * that path: a secret that has changed since the row was written, a row in a
   * format this build cannot read, and a row that is simply corrupt. They are
   * indistinguishable from here, and all three warrant the same action.
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
   * <p>This is what catches a signer decrypted with the wrong secret, or stored in a
   * format this build cannot read -- either fails here rather than at three in the
   * morning when everybody is mysteriously signed out.
   *
   * <p>It no longer catches a signer restored under the wrong id. That was never the
   * intent, only a consequence of the id having been the GCM IV; the nonce is now random
   * and travels inside the blob. See the class javadoc.
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
   * <p>A current-format encrypted private key is 61 bytes -- a version byte, a 12-byte
   * nonce, 32 bytes of ciphertext and a 16-byte tag -- against a {@code VARBINARY(255)}
   * column. {@code TicketSignerCodecTest} asserts that, so a future format change fails
   * a test rather than silently truncating on the way in.
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
