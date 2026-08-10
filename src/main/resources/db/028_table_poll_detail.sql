/*
 * A custom question a poll asks its respondents.
 *
 * Column-for-column the same shape as `detail` (002), because it is the same
 * idea and reuses the same five Detail.Type ordinals -- STRING, BOOLEAN,
 * INTEGER, EMAIL and PHONE, with their validation regexes -- rather than
 * declaring a second enum that would drift from the first.
 *
 * A separate table rather than a nullable `poll` column on `detail`: `detail`
 * has `event BINARY(16) NOT NULL` and every finder, every foreign key and the
 * whole of volunteer_detail depends on that. Making it nullable to admit polls
 * would weaken a constraint that currently holds, for the sake of saving one
 * CREATE TABLE.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}poll_detail (
  id BINARY(16) NOT NULL,
  poll BINARY(16) NOT NULL,
  detail_type TINYINT UNSIGNED NOT NULL,
  label VARCHAR(255) NOT NULL,
  hint VARCHAR(255) NOT NULL,
  priority TINYINT UNSIGNED NOT NULL,
  required BIT NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (poll) REFERENCES ${prefix}poll (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (id)
)Engine=InnoDB;
