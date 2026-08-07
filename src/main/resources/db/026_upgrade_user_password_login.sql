/*
 * Whether an account still accepts a password.
 *
 * This is the column that makes passkeys worth having. A passkey sitting
 * beside an unchanged password path is an alternative way in and nothing more:
 * the AXB-SIG-REQ credential still exists, and while the sign-in-route
 * restriction and the freshness window bound what a captured one is worth, the
 * password remains a thing that can be phished. Turning it off per account is
 * where that stops being true.
 *
 * Default 0 -- on -- and deliberately so. Nobody is opted in by a migration;
 * an account only stops accepting a password when its owner says so, and only
 * when it has enough passkeys to survive losing one. See
 * ModifyUserEndpoint for the four guards.
 *
 * ResetUserEndpoint clears this whenever it installs a new public key, which is
 * what stops the switch being a one-way door: an account that turned its
 * password off and then lost every passkey is recovered by email, and comes
 * back with a working password.
 *
 * Appended with no AFTER clause so MariaDB takes ALGORITHM=INSTANT and does not
 * rebuild the table -- the constraint 022's header records, and which
 * e2e/run.sh asserts by comparing CREATE_TIME across a restart.
 *
 * Block comments deliberately -- see the note in 006.
 */
ALTER TABLE ${database}.${prefix}user
  ADD COLUMN IF NOT EXISTS password_login_disabled BIT NOT NULL DEFAULT 0
