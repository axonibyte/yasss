/*
 * One respondent saying yes to one square.
 *
 * Note what is not here: no nullable column, and therefore no way for the
 * primary key to fail to constrain. That is the entire payoff of giving
 * poll_cell a surrogate id -- see the long note in 029. An all-day vote and a
 * nine-o'clock vote are the same shape of row against the same column, so the
 * tally is one GROUP BY rather than a UNION of two tables that have to be kept
 * in step with each other.
 *
 * There is no capacity concept, which is the other way this differs from `rsvp`
 * -- a poll square cannot fill up, so none of RSVP's locking or CapacityException
 * machinery has an analogue here.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}poll_vote (
  response BINARY(16) NOT NULL,
  cell BINARY(16) NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (response) REFERENCES ${prefix}poll_response (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (cell) REFERENCES ${prefix}poll_cell (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (response, cell)
)Engine=InnoDB;

/*
 * The tally reads cell-major -- "how many said yes to this square" -- and the
 * primary key is response-major, so it cannot serve that. One index, and the
 * results view stops being a scan of every vote on the poll.
 */
CREATE INDEX IF NOT EXISTS idx_poll_vote_cell
  ON ${database}.${prefix}poll_vote (cell);
