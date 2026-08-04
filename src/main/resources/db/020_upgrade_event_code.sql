/*
 * Short, copyable identifiers for events.
 *
 * A UUID is thirty-six characters of hex. Nobody reads one down a telephone,
 * writes one on a whiteboard, or types one off a flyer. Eight Crockford Base32
 * symbols, shown as XXXX-XXXX, can be done all three ways -- the alphabet omits
 * I, L, O and U, and the ambiguous characters fold into the ones that survive,
 * so reading a code aloud and writing it down cannot produce a different code.
 *
 * The column holds the canonical form: uppercase, no separator. Storing it that
 * way keeps the collation out of the question of whether two codes are equal --
 * the hyphen and the case are presentation only, and normalisation happens in
 * EventCode before anything reaches SQL.
 *
 * Appended rather than positioned, so this stays ALGORITHM=INSTANT; a
 * positional ADD forces a table rebuild, which run.sh asserts against.
 *
 * The UNIQUE index is what makes generation safe. Event.commit assigns a code
 * when one is missing and retries on a duplicate-key violation rather than
 * checking first and then inserting -- the check-then-act shape this codebase
 * has spent two rounds removing everywhere else.
 *
 * NULL is permitted: existing rows have no code until the startup backfill
 * reaches them, and MariaDB allows repeated NULLs in a unique index.
 *
 * Block comments deliberately -- see the note in 006.
 */
ALTER TABLE ${database}.${prefix}event
  ADD COLUMN IF NOT EXISTS code CHAR(8) DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_code
  ON ${database}.${prefix}event (code);
