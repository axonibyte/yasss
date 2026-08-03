/*
 * Clear volunteer rows that point at an account which no longer exists.
 *
 * `volunteer.user` never had a foreign key, so deleting a user left its
 * volunteers referencing an id that had gone. 014 adds the constraint, and it
 * would be rejected outright while any such row survives -- so this runs first.
 * File order is what sequences them: Database.setup executes db/*.sql in
 * lexical order within a single boot.
 *
 * NULL is the right resolution rather than deletion: an anonymous volunteer is
 * a first-class state in this schema, and the organiser still needs the RSVP.
 *
 * Idempotent by construction -- once no orphans remain it matches nothing.
 *
 * One statement, block comments only. See docs/upstream-axb-lib-db.md.
 */
UPDATE ${database}.${prefix}volunteer v
  LEFT JOIN ${database}.${prefix}user u ON v.user = u.id
  SET v.user = NULL
  WHERE v.user IS NOT NULL
    AND u.id IS NULL
