-- Widen volunteer IP storage to accommodate IPv6.
--
-- `ip_addr INT UNSIGNED` with INET_ATON can only hold IPv4. Any IPv6 client --
-- including ::1 in local development and in the browser test suite, and a large
-- share of mobile traffic -- yielded NULL, so the per-IP cap on anonymous
-- signups silently never applied to them.
--
-- VARBINARY(16) with INET6_ATON holds both families (4 bytes for IPv4, 16 for
-- IPv6).
--
-- Note that Database.setup re-runs every script on every boot and tracks
-- nothing, so this must stay idempotent. That is also why the old column is
-- left in place rather than dropped and renamed: a DROP/RENAME pair cannot be
-- re-executed. `ip_addr` is unused by the application after this change and can
-- be dropped by hand once the backfill has been verified in production.
ALTER TABLE ${database}.${prefix}volunteer
  ADD COLUMN IF NOT EXISTS
  ip_addr_bin VARBINARY(16)
  AFTER ip_addr;
