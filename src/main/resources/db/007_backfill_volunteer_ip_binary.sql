-- Carry existing IPv4 addresses into the widened column.
--
-- Idempotent by construction: rows that already have a binary address are
-- skipped, so re-running this on every boot is a no-op once it has converged.
UPDATE ${database}.${prefix}volunteer
  SET ip_addr_bin = INET6_ATON(INET_NTOA(ip_addr))
  WHERE ip_addr IS NOT NULL
    AND ip_addr_bin IS NULL;
