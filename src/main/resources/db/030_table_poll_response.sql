/*
 * One person's answer. Exactly one row per submission -- a poll has no analogue
 * of "add another volunteer", and that is the whole difference between
 * answering a poll and signing up for an event.
 *
 * Three identity columns, used asymmetrically on purpose. `user` is the only
 * one consulted for a caller who is signed in. `ip_addr_bin` and `fingerprint`
 * are consulted only for a caller who is not -- but all three are WRITTEN every
 * time. That asymmetry is the requirement, not an oversight: a signed-in
 * respondent is never blocked by a browser fingerprint, but theirs is recorded,
 * so a later logged-out attempt from the same browser is. Skipping the write
 * when authenticated would make the second half of that unimplementable.
 *
 * ip_addr_bin is VARBINARY(16) written through INET6_ATON, not INT UNSIGNED.
 * 006 records what happens otherwise: every IPv6 client, which is most mobile
 * traffic and every containerised test, yields NULL and the cap silently never
 * applies at all.
 *
 * `fingerprint` is BINARY(32) holding SHA-256(poll id || client digest).
 * Salting per poll costs one hash and means the same browser answering two
 * polls stores two unrelated values, so this table cannot be used to link a
 * person across polls. That is the difference between a duplicate check and a
 * tracking database. Nullable, because a hardened browser that refuses to
 * produce a digest must still be able to answer.
 *
 * `edit_token` is how an anonymous respondent proves an answer is theirs, in
 * the shape volunteer.reminder_token already uses. It is deliberately not the
 * IP and not the fingerprint: everyone behind one NAT shares an address, and
 * letting an address authorise an edit would let a stranger rewrite somebody
 * else's answer.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}poll_response (
  id BINARY(16) NOT NULL,
  poll BINARY(16) NOT NULL,
  user BINARY(16),
  name VARCHAR(255) NOT NULL,
  ip_addr_bin VARBINARY(16),
  fingerprint BINARY(32),
  edit_token BINARY(16),
  submitted DATETIME NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (poll) REFERENCES ${prefix}poll (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (user) REFERENCES ${prefix}user (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  PRIMARY KEY (id)
)Engine=InnoDB;

/*
 * The three lookups the duplicate check performs, each covered. Without these
 * the check is a full scan of every response ever recorded, taken while holding
 * the poll's row lock -- which is the worst possible place to put one.
 */
CREATE INDEX IF NOT EXISTS idx_poll_response_user
  ON ${database}.${prefix}poll_response (poll, user);

CREATE INDEX IF NOT EXISTS idx_poll_response_ip
  ON ${database}.${prefix}poll_response (poll, ip_addr_bin);

CREATE INDEX IF NOT EXISTS idx_poll_response_fp
  ON ${database}.${prefix}poll_response (poll, fingerprint);
