/*
 * Drop the legacy IPv4-only address column.
 *
 * `ip_addr INT UNSIGNED` was superseded by `ip_addr_bin VARBINARY(16)` in 006,
 * which holds both address families; nothing in the application has read the
 * old column since.
 *
 * PRECONDITION, and it is a real one: this is destructive, and it is only safe
 * because the 006 widening plus its backfill have been confirmed applied in
 * production. A deployment that had never booted with the backfill would lose
 * its historical IPv4 addresses here.
 *
 * The 005 ADD and the 007 backfill were deleted in the same change rather than
 * left in place. Keeping them would have meant re-adding the column and
 * dropping it again on every single boot -- and because the ADD carried an
 * AFTER clause, that is a full InnoDB table rebuild twice per start. Deleting
 * them is safe precisely because of the precondition above: with the data
 * already carried across, neither script has anything left to do.
 *
 * DROP COLUMN IF EXISTS is what makes this survive Database.setup replaying
 * every script on every boot. A bare DROP would fail on the second start.
 *
 * One statement, block comments only. That was a hard constraint of
 * axb-lib-db before 0.4.1 and is now merely the house style; see
 * docs/upstream-axb-lib-db.md.
 */
ALTER TABLE ${database}.${prefix}volunteer
  DROP COLUMN IF EXISTS ip_addr
