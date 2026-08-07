/*
 * The credential replay ledger.
 *
 * A v2 AXB-SIG-REQ credential carries a random nonce and a timestamp, and is
 * good for exactly one use inside the skew window. This table is what "exactly
 * one" means: the composite primary key IS the guarantee, a claim is an
 * INSERT IGNORE, and only the caller whose insert affects a row may proceed.
 * Read AuthNonce before changing anything here.
 *
 * Keyed on (account, jti) rather than on jti alone. A global unique constraint
 * would let one account's nonce collide with another's and refuse a perfectly
 * good sign-in, which is a worse failure than the one being prevented -- the
 * client would retry and collide again.
 *
 * Deliberately NOT a hash of the whole payload: Ed25519 signatures are
 * deterministic, so without the nonce two sign-ins in the same millisecond
 * would produce byte-identical payloads and be indistinguishable from a replay.
 * The nonce is what makes distinctness possible at all.
 *
 * NO FOREIGN KEY to user, which departs from reminder_log on purpose. An FK
 * takes a shared lock on the user row for every sign-in, and it makes deleting
 * an account wait on its nonce rows. Reaping by iat covers the cleanup that
 * ON DELETE CASCADE would have done, and a stranded row is harmless -- it can
 * only ever refuse a credential that is already expired.
 *
 * NO CHARACTER COLUMNS, also on purpose. 017 converts the database and every
 * character column to utf8mb4, and e2e/run.sh asserts that against a server
 * deliberately started as latin1. A VARCHAR here would be created afterwards,
 * inherit latin1 and fail that check on a fresh deployment. BINARY and BIGINT
 * dodge the question, which is the same reason reminder_log gets away with it.
 *
 * `iat` is epoch milliseconds rather than a TIMESTAMP, matching session_epoch
 * in 022: it is compared against System.currentTimeMillis() and a round trip
 * through the session time zone is one more thing to get wrong. Indexed
 * because reaping is a range scan on it and nothing else ever reads it.
 *
 * Volume is one row per sign-in, not per request -- the credential branch is
 * only reachable at GET /v1, and the client trades the result for a ticket
 * immediately. At ten thousand sign-ins a minute and a five-minute window this
 * holds about fifty thousand rows.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}auth_nonce (
  account BINARY(16) NOT NULL,
  jti BINARY(16) NOT NULL,
  iat BIGINT NOT NULL,
  PRIMARY KEY (account, jti),
  KEY idx_auth_nonce_iat (iat)
)Engine=InnoDB
