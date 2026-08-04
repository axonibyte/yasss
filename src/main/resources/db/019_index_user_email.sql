/*
 * Index the column every authentication resolves against.
 *
 * `User.getUser(String email)` is on the path of every single authenticated
 * request -- `AuthToken.process` resolves the caller by address before anything
 * else happens -- and of every registration, which checks the same column for a
 * conflict. `user.email` carried no index at all, so each of those was a full
 * table scan followed by a filesort for `ORDER BY last_update DESC`.
 *
 * Not UNIQUE, deliberately. Both create and modify already treat a duplicate as
 * a 409, so the application invariant is enforced; but `email` is NULL for every
 * account that has not yet verified, and while MariaDB permits repeated NULLs in
 * a unique index, adding one here would fail outright on any existing database
 * that already holds two accounts sharing an address from before those checks
 * were correct. A plain index buys the performance without that risk.
 *
 * `CREATE INDEX IF NOT EXISTS` is idempotent, which matters because
 * Database.setup replays every script on every boot.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE INDEX IF NOT EXISTS idx_user_email
  ON ${database}.${prefix}user (email);
