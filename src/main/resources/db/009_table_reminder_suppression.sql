/*
 * Addresses that have unsubscribed, suppressed platform-wide rather than per
 * volunteer row.
 *
 * Someone who signs up for several events and unsubscribes once expects to be
 * done; per-row-only unsubscribe is how sending domains end up blocklisted.
 *
 * Deliberately not foreign-keyed to anything: a suppression must outlive the
 * volunteer row that produced it, and the row it came from may be cascaded away
 * when its event is deleted.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}reminder_suppression (
  email VARCHAR(255) NOT NULL,
  suppressed_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    NOT NULL,
  PRIMARY KEY (email)
)Engine=InnoDB;
