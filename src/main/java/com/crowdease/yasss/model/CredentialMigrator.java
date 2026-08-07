/*
 * Copyright (c) 2026 CrowdEase, LLC.
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
import java.util.List;
import java.util.UUID;

import com.axonibyte.lib.auth.Credentialed;
import com.axonibyte.lib.auth.CryptoException;
import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;

import org.bouncycastle.util.encoders.Base32;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Rewrites stored credential material that predates the current encryption format.
 *
 * <p>{@code axb-lib-auth-java} reads legacy records transparently, so nothing breaks
 * without this. What it does not do is <em>rewrite</em> them: that happens only when an
 * entity is saved for some other reason. Left alone, the accounts that keep fixed-IV
 * ciphertext indefinitely are exactly the ones that never change a credential -- the
 * least active, and the ones least likely to notice.
 *
 * <p>This is the counterpart the library's javadoc used to point at by name without
 * anything existing behind it. It lives here rather than upstream because migrating
 * stored records needs a database, and the library has none.
 *
 * <h2>Why not {@code User.commit()}</h2>
 *
 * <p>Because {@code commit} does more than write columns: it reconciles pending email
 * addresses, and that includes deleting other users whose {@code pending_email} matches
 * the address this one just verified. Sweeping through it would run that deletion once
 * per user on every boot. {@code Event.backfillCodes} gets away with calling
 * {@code commit} only because {@code Event.commit} has no such side effect. So this
 * issues its own narrow {@code UPDATE}.
 *
 * <h2>Why ticket signers are not swept</h2>
 *
 * <p>Deliberately, and it should stay that way. {@code TicketEngine} rotates daily and
 * {@code TicketSigner.prune} drops anything past the retention window, so on the shipped
 * defaults every legacy row is gone within thirty days without a line of code.
 * {@code TicketSigner.usable} already discards a signer that fails to round-trip, so the
 * worst case is bounded at "some users sign in again". And the library reads the legacy
 * format meanwhile, so the upgrade itself signs nobody out. A sweep here would be code
 * that runs meaningfully once in the product's lifetime and is untestable afterwards.
 *
 * @author Caleb L. Power
 */
public final class CredentialMigrator {

  private static final Logger logger = LoggerFactory.getLogger(CredentialMigrator.class);

  /**
   * The length of a raw, unencrypted TOTP secret.
   *
   * <p>{@code DefaultSecretGenerator} emits 32 base32 characters, which decode to exactly
   * twenty bytes. No ciphertext this system produces is that length -- an MFA secret is 36
   * bytes under the legacy format and 49 under the current one -- so the length alone
   * identifies a secret that was stored in the clear. {@code CredentialMigratorTest} pins
   * those numbers so the distinction cannot quietly collapse. See
   * {@link Decision#PLAINTEXT}.
   */
  private static final int PLAINTEXT_MFA_BYTES = 20;

  /** What a stored blob turned out to be. */
  public enum Decision {

    /** Already in the current format. Nothing to do, which is every row after the first boot. */
    CURRENT,

    /** Readable under the legacy fixed-IV scheme, and needs rewriting. */
    LEGACY,

    /**
     * Not encrypted at all.
     *
     * <p>Only reachable from a deployment that ran with no {@code ticket.globalSecret},
     * back when the library returned credential material unchanged rather than refusing
     * to handle it. Those secrets are sitting in the database in the clear, and would be
     * stranded permanently by a migration that only understood ciphertext.</p>
     */
    PLAINTEXT,

    /**
     * Cannot be read at all.
     *
     * <p>A corrupt record, or one written under a secret this deployment no longer holds.
     * Left exactly as found -- see {@link #sweepMFASecrets()}.</p>
     */
    UNREADABLE
  }

  /**
   * The outcome of a sweep.
   *
   * @param migrated records rewritten in the current format
   * @param adopted plaintext secrets that were encrypted for the first time
   * @param failed records that could not be read and were left alone
   * @param contended records another instance rewrote first
   */
  public static record Result(int migrated, int adopted, int failed, int contended) { }

  /**
   * Classifies a stored blob without modifying anything.
   *
   * <p>Separated from the sweep so that the decision -- which is where all the interesting
   * cases are -- can be tested without a database.</p>
   *
   * @param probe a {@link Credentialed} carrying the entity's real ID, since the legacy
   *        format derives its IV from it
   * @param stored the stored credential material
   * @return what the blob turned out to be
   */
  public static Decision classify(Credentialed probe, byte[] stored) {
    if(null == stored) return Decision.CURRENT;

    if(!probe.isLegacyFormat(stored)) return Decision.CURRENT;

    // isLegacyFormat answers "not readable as a current-format record", which covers
    // genuinely legacy, corrupt, and encrypted-under-another-secret alike. Only an actual
    // decryption tells them apart.
    //
    // Migrating a throwaway copy is the probe: it throws when the record cannot be read
    // and succeeds when it can. Note the blob goes in the privkey slot rather than the
    // mfakey slot -- the library treats both identically, and verifyTOTP would be the
    // wrong instrument here because it swallows CryptoException and answers false, which
    // is indistinguishable from a wrong code.
    try {
      new Credentialed(probe.getID(), null, stored, null).migrateCredentialFormat();
      return Decision.LEGACY;

    } catch(CryptoException e) {
      // Not readable as either format. Before writing it off, check whether it is a TOTP
      // secret that was never encrypted at all.
      //
      // Length is the whole test, and that is not laziness. AES-GCM ciphertext is the
      // plaintext length plus a 16-byte tag, so producing exactly twenty bytes would need
      // a four-byte plaintext -- and nothing here stores one: a TOTP secret is twenty
      // bytes and an Ed25519 private key is thirty-two, giving 36 and 48 respectively
      // under the legacy format and 49 and 61 under the current one. So no ciphertext
      // this system writes can be mistaken for a plaintext secret.
      //
      // A base32 round-trip looks like a stronger check and is not one: base32 encodes
      // arbitrary bytes, so every input round-trips and the test always passes. It was
      // here and has been removed rather than left to imply a guarantee it never gave.
      if(PLAINTEXT_MFA_BYTES == stored.length) return Decision.PLAINTEXT;
      return Decision.UNREADABLE;
    }
  }

  /**
   * Rewrites every legacy MFA secret in the current format.
   *
   * <p>Idempotent, self-limiting and non-fatal, in the shape of
   * {@code Event.backfillCodes}: read everything, close the connection, then work through
   * the list one row at a time so that one bad record cannot abort the rest.
   *
   * <p>A record that cannot be read is <b>left exactly as it is</b>. Nulling the column
   * would be tidier and would silently disable multi-factor authentication for that
   * account -- a security downgrade delivered by a migration nobody asked for.
   *
   * @return what happened
   * @throws SQLException if the initial read fails; per-row failures are logged instead
   */
  public static Result sweepMFASecrets() throws SQLException {
    final String table = YasssCore.getDB().getPrefix() + "user";

    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    record Row(UUID id, byte[] mfakey) { }
    List<Row> pending = new ArrayList<>();

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          "SELECT id, mfakey FROM " + table + " WHERE mfakey IS NOT NULL");
      res = stmt.executeQuery();
      while(res.next())
        pending.add(new Row(SQLBuilder.bytesToUUID(res.getBytes("id")), res.getBytes("mfakey")));
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    int migrated = 0, adopted = 0, failed = 0, contended = 0;

    for(Row row : pending) {
      try {
        Credentialed probe = new Credentialed(row.id(), null, null, row.mfakey());
        Decision decision = classify(probe, row.mfakey());

        byte[] rewritten;
        switch(decision) {
          case CURRENT -> {
            continue;
          }
          case LEGACY -> {
            Credentialed entity = new Credentialed(row.id(), null, null, row.mfakey());
            entity.migrateCredentialFormat();
            rewritten = entity.getEncMFASecret();
          }
          case PLAINTEXT -> {
            // Encrypt it for the first time. The residual risk -- a corrupt ciphertext
            // that happens to be twenty base32-clean bytes, adopted as a secret -- costs
            // nothing, because that account's TOTP already does not work.
            logger.warn(
                "MFA secret for {} was stored unencrypted, from a deployment that ran with "
                + "no ticket.globalSecret. Encrypting it now.",
                row.id());
            Credentialed entity = new Credentialed(row.id(), null, null, null);
            entity.setMFAKey(
                new String(Base32.encode(row.mfakey()), java.nio.charset.StandardCharsets.US_ASCII));
            rewritten = entity.getEncMFASecret();
          }
          default -> {
            logger.warn(
                "MFA secret for {} could not be read and was left untouched. That account "
                + "cannot use multi-factor authentication until it re-enrols; see "
                + "docs/upstream-axb-lib-auth.md.",
                row.id());
            failed++;
            continue;
          }
        }

        if(store(table, row.id(), row.mfakey(), rewritten)) {
          if(Decision.PLAINTEXT == decision) adopted++;
          else migrated++;
        } else {
          // Another instance got there first, or the user changed their secret between
          // the read and the write. Either way the stored value is newer than ours.
          logger.debug("MFA secret for {} changed under the sweep; leaving it.", row.id());
          contended++;
        }

      } catch(CryptoException | SQLException e) {
        logger.warn(
            "could not migrate the MFA secret for {}: {}", row.id(), e.getMessage());
        failed++;
      }
    }

    return new Result(migrated, adopted, failed, contended);
  }

  /**
   * Writes a rewritten secret, but only if nothing else has changed it.
   *
   * <p>The {@code mfakey = ?} predicate is a compare-and-swap, and it is what makes this
   * safe to run on two instances booting at once: both re-encrypt the same legacy blob to
   * different ciphertexts, both attempt the write, and the second one matches nothing and
   * affects no rows. It equally covers a user rotating their secret between the read and
   * the write, which would otherwise be overwritten with a re-encryption of the old one.</p>
   *
   * @return {@code true} if this call is the one that wrote
   */
  private static boolean store(String table, UUID id, byte[] expected, byte[] rewritten)
      throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          "UPDATE " + table + " SET mfakey = ? WHERE id = ? AND mfakey = ?");
      stmt.setBytes(1, rewritten);
      stmt.setBytes(2, SQLBuilder.uuidToBytes(id));
      stmt.setBytes(3, expected);
      return 0 != stmt.executeUpdate();
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }

  private CredentialMigrator() { }

}
