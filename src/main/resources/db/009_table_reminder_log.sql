/*
 * The send ledger, and the deduplication guarantee.
 *
 * Its composite primary key IS the guarantee: a claim is an INSERT IGNORE, and
 * only the instance whose insert affects one row may send. Two app instances
 * polling at once, or one restarted mid-sweep, therefore cannot double-send.
 *
 * The claim is taken BEFORE the send, not after. At-most-once is the correct
 * bias for email -- a duplicate reminder is worse than a missed one, and the
 * poll loop offers no retry semantics anyway.
 *
 * Keyed on the begin time of the event's earliest window rather than a window
 * id, for two reasons: the finder derives that time with MIN()..GROUP BY and so
 * never holds the id, and if an organiser reschedules the event the volunteer
 * genuinely warrants a fresh reminder, because the body quotes a date.
 *
 * `delivered` is diagnostic only -- it lets an operator spot claimed-but-unsent
 * rows after a crash. Do NOT drive re-sends off it; that reintroduces the
 * double-send this table exists to prevent.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}reminder_log (
  volunteer BINARY(16) NOT NULL,
  window_begin DATETIME NOT NULL,
  claimed_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    NOT NULL,
  delivered BIT NOT NULL DEFAULT 0,
  FOREIGN KEY (volunteer) REFERENCES ${prefix}volunteer (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (volunteer, window_begin)
)Engine=InnoDB;
