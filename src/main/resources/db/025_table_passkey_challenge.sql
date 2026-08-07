/*
 * Pending WebAuthn ceremonies.
 *
 * The single-use guarantee, and the reason this is a table rather than a signed
 * cookie. A stateless challenge -- HMAC over a nonce and an expiry, verified
 * without storage -- costs nothing and is wrong here for one reason: it cannot
 * be single-use. It stays replayable until it expires, and combined with an
 * authenticator reporting sign_count = 0, which is most of them, that makes the
 * whole assertion replayable for its TTL. Single-use IS the security claim.
 *
 * The claim is the DELETE: `WHERE challenge = ? AND ceremony = ?`, proceed only
 * if it affected a row. That is reminder_log's at-most-once guarantee inverted
 * -- there the INSERT wins, here the DELETE does -- and it is multi-instance
 * safe with no coordination and nothing to propagate.
 *
 * `ceremony` is in the WHERE, not merely stored, so a registration challenge
 * cannot be spent as an authentication one.
 *
 * `user` is NULL for authentication, which is deliberately usernameless: the
 * begin endpoint takes no email, so it cannot become an oracle for whether an
 * address is registered. For registration it carries the account, and the finish
 * endpoint compares it against the caller -- a challenge issued for one account
 * cannot be finished onto another.
 *
 * In memory would lose every in-flight ceremony on deploy, which is the same
 * defect migration 021 fixed for ticket signers, reintroduced for no gain.
 *
 * Pruned opportunistically at the top of each begin endpoint rather than by a
 * daemon: one row per login attempt with a five-minute life means a busy
 * deployment holds hundreds, not millions.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}passkey_challenge (
  challenge BINARY(32) NOT NULL,
  user BINARY(16) DEFAULT NULL,
  ceremony TINYINT UNSIGNED NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY (challenge),
  KEY idx_passkey_challenge_expires (expires_at)
)Engine=InnoDB
