/*
 * A votable square, and the table this whole schema is arranged around.
 *
 * A row exists iff that square is offered -- the same convention `slot` uses,
 * where a slot row exists iff it is enabled. A square with no row renders
 * "Unavailable". That is what the window editor's "apply to" control writes: it
 * is not stored anywhere as a control, it is an authoring affordance that
 * decides which rows land here.
 *
 * THE SURROGATE KEY IS THE POINT, so it is worth writing down why. The obvious
 * shape is a composite key (poll_option, poll_window) mirroring `slot`, with
 * poll_window NULL meaning "the whole day". That shape is broken on MySQL and
 * MariaDB: NULLs compare distinct in a unique index, so PRIMARY KEY
 * (poll_option, poll_window) would permit unlimited duplicate all-day rows --
 * and, far worse, a vote table keyed the same way would let one respondent vote
 * all-day as many times as they liked, with the tally quietly inflating and not
 * one constraint violated anywhere.
 *
 * So the cell carries its own id, and poll_vote references that id and holds no
 * nullable column at all. The uniqueness problem does not vanish, it moves
 * here, where it is far less dangerous: cells are written by the poll's
 * organiser in one transaction, not raced for by the public. It is still
 * enforced, twice:
 *
 *   idx_poll_cell_pair    (poll_option, poll_window) -- one row per timed
 *                         square. Does nothing for all-day rows, whose
 *                         poll_window is NULL and therefore distinct.
 *   idx_poll_cell_allday  (poll_option, all_day_key) -- and all_day_key is 1
 *                         exactly for the all-day rows and NULL for every
 *                         other, so this index constrains precisely the rows
 *                         the first one cannot see, and constrains nothing
 *                         else.
 *
 * Between them: at most one row per (option, window), and at most one all-day
 * row per option. The NULL-distinctness that is the trap above is what makes
 * the second index selective -- the same technique 028 uses on the option
 * table, turned to the same purpose.
 *
 * NOTE THE MISSING `ON UPDATE CASCADE` on the poll_window foreign key, which is
 * on every other foreign key in this schema. MariaDB refuses (error 1901) to
 * let a generated column read a column that carries a cascading update, because
 * the cascade would have to recompute it. So the choice is between the clause
 * and the index, and the index wins on the merits: `ON UPDATE CASCADE` fires
 * only if a poll_window's primary key is updated, and these keys are random
 * UUIDs assigned once at insert -- nothing in the application updates one, and
 * nothing could sensibly want to. The clause is inert convention here. The
 * index is what stops one respondent voting all-day five times with the tally
 * quietly agreeing. `ON DELETE CASCADE`, which does fire, is kept.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}poll_cell (
  id BINARY(16) NOT NULL,
  poll_option BINARY(16) NOT NULL,
  poll_window BINARY(16),
  all_day_key TINYINT UNSIGNED
    AS (CASE WHEN poll_window IS NULL THEN 1 ELSE NULL END) STORED,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (poll_option) REFERENCES ${prefix}poll_option (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (poll_window) REFERENCES ${prefix}poll_window (id)
    ON DELETE CASCADE,
  PRIMARY KEY (id)
)Engine=InnoDB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_cell_pair
  ON ${database}.${prefix}poll_cell (poll_option, poll_window);

CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_cell_allday
  ON ${database}.${prefix}poll_cell (poll_option, all_day_key);
