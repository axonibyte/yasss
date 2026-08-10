/*
 * One column of the poll grid: a day of the week, or a specific date.
 *
 * Two nullable columns with a CHECK rather than one polymorphic column. A
 * single column cannot do this job -- a DATE cannot hold "Tuesday" -- and an
 * integer discriminator beside an integer payload would mean every read site
 * re-deriving which it is. The scope lives on the poll, so the CHECK cannot
 * reference it; but the within-row invariant is the one that matters, because
 * it is the one a buggy endpoint could actually violate.
 *
 * NOTE THE TWO UNIQUE INDEXES, and note that they lean on MySQL and MariaDB
 * treating NULLs in a unique index as distinct. That is normally the trap this
 * schema has to work around (see 029); here it is exactly the right tool. On a
 * RELATIVE poll every row has a day_of_week and a NULL option_date, so
 * idx_poll_option_dow blocks a duplicate weekday while idx_poll_option_date
 * constrains nothing. On an ABSOLUTE poll the reverse. One pair of indexes,
 * both scopes, no discriminator.
 *
 * day_of_week is ISO-8601 -- Monday is 1, Sunday is 7 -- which is exactly what
 * java.time.DayOfWeek.getValue() returns, so no arithmetic happens anywhere.
 *
 * `all_day` is the authority for whether this column asks about the whole day
 * rather than about particular times. It is deliberately a flag here and not a
 * kind of cell: the header checkbox has to render without a join, and a flag
 * cannot disagree with itself the way a flag and a row can. Turning it on is
 * non-destructive -- the column's timed cells stay exactly where they are and
 * simply stop being offered -- so turning it back off restores the column.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}poll_option (
  id BINARY(16) NOT NULL,
  poll BINARY(16) NOT NULL,
  day_of_week TINYINT UNSIGNED,
  option_date DATE,
  all_day BIT NOT NULL,
  priority TINYINT UNSIGNED NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  CONSTRAINT chk_poll_option_kind
    CHECK ((day_of_week IS NULL) <> (option_date IS NULL)),
  FOREIGN KEY (poll) REFERENCES ${prefix}poll (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (id)
)Engine=InnoDB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_option_dow
  ON ${database}.${prefix}poll_option (poll, day_of_week);

CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_option_date
  ON ${database}.${prefix}poll_option (poll, option_date);
