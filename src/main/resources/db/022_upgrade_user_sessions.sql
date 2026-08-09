/*
 * Server-side session revocation, and expiry for the two emailed tokens.
 *
 * `session_epoch` is the revocation watermark: a ticket whose session began at
 * or before it is refused. Every authenticated request already loads its user
 * row, so the check costs one column read and one comparison -- no extra query,
 * which is what makes immediate revocation affordable on a path this hot.
 * Zero means "nothing has ever been revoked", and no real timestamp is <= 0.
 *
 * `verify_token_expires` and `reset_token_expires` are epoch milliseconds, NULL
 * meaning "does not expire". NULL is what every token minted before this
 * migration has, and honoring it is deliberate: retrofitting an expiry onto
 * links already sitting in inboxes would break them at upgrade time for no
 * security gain.
 *
 * `reset_token` gets its own column pair rather than sharing the verification
 * one. Both can be outstanding at once -- request a reset while an address
 * change is pending -- and their lifetimes differ by an order of magnitude
 * because their consequences do: a stale verification link confirms an address,
 * a stale reset link takes over the account.
 *
 * Columns are appended with no AFTER, so MariaDB takes ALGORITHM=INSTANT and
 * does not rebuild the table. run.sh asserts CREATE_TIME is unchanged across a
 * restart, which is what would catch a regression here.
 *
 * One statement, block comments only -- house style; see
 * docs/upstream-axb-lib-db.md.
 */
ALTER TABLE ${database}.${prefix}user
  ADD COLUMN IF NOT EXISTS session_epoch BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verify_token_expires BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reset_token BINARY(16) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reset_token_expires BIGINT DEFAULT NULL
