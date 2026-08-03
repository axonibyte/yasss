/*
 * The foreign key `volunteer.user` should always have had.
 *
 * `event.admin_user` is properly constrained (001) with exactly this shape;
 * this column was simply missed, so deleting a user silently left dangling
 * references behind. ON DELETE SET NULL rather than CASCADE for the same reason
 * it is right on the event: losing an account must not destroy the signup, it
 * should just make it anonymous -- which the schema already models.
 *
 * 013 clears any pre-existing orphans; without that this constraint cannot be
 * created at all.
 *
 * ADD FOREIGN KEY IF NOT EXISTS is what makes this survive Database.setup
 * replaying every script on every boot. Note the shape: MariaDB 11 rejects
 * `ADD CONSTRAINT IF NOT EXISTS <symbol> FOREIGN KEY ...` outright -- the
 * guard belongs on the key, not the constraint, and the name that follows is
 * the index name rather than a constraint symbol.
 *
 * One statement, block comments only. That was a hard constraint of
 * axb-lib-db before 0.4.1 and is now merely the house style; see
 * docs/upstream-axb-lib-db.md.
 */
ALTER TABLE ${database}.${prefix}volunteer
  ADD FOREIGN KEY IF NOT EXISTS fk_volunteer_user (user)
  REFERENCES ${prefix}user (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
