/*
 * Cover the reminder finder's aggregate.
 *
 * It computes MIN(begin_time) GROUP BY event across the whole event_window
 * table on every poll. Without this that is a full scan every
 * reminders.pollInterval minutes, forever. The foreign key on `event` provides
 * a single-column index only, which does not cover the aggregate.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE INDEX IF NOT EXISTS idx_${prefix}window_event_begin
  ON ${database}.${prefix}event_window (event, begin_time);
