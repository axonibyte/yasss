/*
 * One row of the poll grid: a start time, and nothing else.
 *
 * TIME, not DATETIME. A poll's window has no date -- the date, or the weekday,
 * comes from the column it intersects -- and on a RELATIVE poll there is no
 * date to be had at all. This is the one structural reason `event_window` could
 * not simply be reused. docs/utc-storage.md applies unchanged, and more easily
 * than elsewhere: a TIME round-trips through the driver with no zone
 * conversion, so the value stored is the value the organiser typed, in whatever
 * frame poll.time_mode declares.
 *
 * No end time, by design. A poll asks "can you make 9am?", not "can you do 9
 * until 12?" -- the whole point is to find the hour, and the duration is the
 * event's problem once the poll has answered that.
 *
 * `applies_to_new_options` is the "apply to future days/dates" control, stored
 * as a standing rule rather than expanded once. That distinction is the whole
 * requirement: a column added a week after the window was written must pick the
 * window up, which a one-time expansion cannot do. AddPollOptionEndpoint reads
 * this flag and creates the matching cells inside the same transaction as the
 * option insert. An organiser who then unticks a particular square is writing
 * an ordinary cell row, and this flag does not undo them.
 *
 * UNIQUE (poll, start_time) because two windows at the same time are
 * indistinguishable to a respondent and would silently split their vote across
 * two rows. The repeat expansion dedupes against existing rows rather than
 * relying on catching the 1062 here.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}poll_window (
  id BINARY(16) NOT NULL,
  poll BINARY(16) NOT NULL,
  start_time TIME NOT NULL,
  applies_to_new_options BIT NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (poll) REFERENCES ${prefix}poll (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (id)
)Engine=InnoDB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_window_time
  ON ${database}.${prefix}poll_window (poll, start_time);
