/*
 * The timezone an event actually happens in.
 *
 * Instants were never ambiguous on the wire -- windows travel as epoch
 * milliseconds -- but nothing recorded *where* an event takes place, so every
 * surface rendered those instants in whatever zone it happened to sit in. The
 * grid used the viewer's browser zone and the mail templates used the server's,
 * which meant a volunteer in another timezone was told two different times for
 * the same shift.
 *
 * For a physical event the event's own zone is the correct one: a bake sale
 * that starts at 9am starts at 9am where the bake sale is, whoever is reading.
 *
 * Nullable on purpose. NULL means "not recorded", which every event created
 * before this migration is, and those keep rendering in the viewer's local zone
 * exactly as they do today -- so this changes nothing retroactively. Only
 * events created from now on carry a zone.
 *
 * IANA identifiers ("America/Chicago"), not offsets: an offset is wrong for
 * half the year anywhere that observes DST. 64 characters comfortably exceeds
 * the longest name in the tz database.
 *
 * One statement, block comments only. That was a hard constraint of
 * axb-lib-db before 0.4.1 and is now merely the house style; see
 * docs/upstream-axb-lib-db.md.
 */
ALTER TABLE ${database}.${prefix}event
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT NULL
