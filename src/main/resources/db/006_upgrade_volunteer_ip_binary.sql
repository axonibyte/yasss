/*
 * Widen volunteer IP storage to accommodate IPv6.
 *
 * `ip_addr INT UNSIGNED` with INET_ATON can only hold IPv4. Any IPv6 client --
 * including ::1 in local development and in the browser test suite, and a large
 * share of mobile traffic -- yielded NULL, so the per-IP cap on anonymous
 * signups silently never applied to them. VARBINARY(16) with INET6_ATON holds
 * both families (4 bytes for IPv4, 16 for IPv6).
 *
 * Database.setup re-runs every script on every boot and tracks nothing, so this
 * must stay idempotent.
 *
 * The legacy `ip_addr` column, its ADD script and its backfill have since been
 * removed; 012 drops the column. See that file for why they went together.
 *
 * NOTE: block comments, not `--`. Before axb-lib-db 0.4.1, Database.setup
 * joined the lines of a script with no separator, so a `--` comment silently
 * commented out everything after it and the statement executed as a no-op with
 * no error at all. That is fixed, and this file is left as-is only because
 * rewriting a working migration buys nothing.
 */
ALTER TABLE ${database}.${prefix}volunteer
  ADD COLUMN IF NOT EXISTS
  ip_addr_bin VARBINARY(16)
  AFTER reminders_enabled;
