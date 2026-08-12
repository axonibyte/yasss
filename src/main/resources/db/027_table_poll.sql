/*
 * A poll: a proposal of candidate times, and the votes cast on them.
 *
 * Deliberately a sibling of `event` rather than a flag on it. The two share a
 * short code, a grid and a publish lifecycle, and nothing else: an event's
 * windows are instants, a poll's are times of day; an event's columns are
 * activities, a poll's are days; an event collects one row per volunteer per
 * signup, a poll collects one row per person, ever. Folding them together would
 * mean seven nullable columns on `event` and a discriminator in every finder in
 * the model package.
 *
 * `scope`, `time_mode` and `result_visibility` store enum ordinals, the way
 * `detail.detail_type` stores Detail.Type, and are read back through a
 * fromOrdinal that clamps rather than throws. Same reasoning as Detail: a row
 * written by a newer build must not make an older one fall over.
 *
 * `time_mode` is the answer to "whose clock is 9am?". WALL_CLOCK means 9am
 * wherever the reader happens to be, and `timezone` is then NULL. ZONED means
 * the poll fixes a zone and every reader sees times converted into whichever
 * zone they select. Wall clock is the default because the common poll is "which
 * mornings suit you", asked of people who are all in one place.
 *
 * `response_deadline` is nullable and means "never closes". Worth dwelling on:
 * an absolute poll's dates eventually pass, but a RELATIVE poll has no dates at
 * all, so this column is the only thing that can ever close one. Two of the six
 * result_visibility settings therefore require it, and that is checked at
 * publish rather than here -- a draft is allowed to be half-built.
 *
 * `code` is a denormalized display copy. `access_code` (032) is the allocator
 * and the uniqueness authority; this column is the read path, already on every
 * projection. A code is assigned once and never reissued, so the two cannot
 * drift.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}poll (
  id BINARY(16) NOT NULL,
  admin_user BINARY(16),
  short_description VARCHAR(255) NOT NULL,
  long_description VARCHAR(255) NOT NULL,
  scope TINYINT UNSIGNED NOT NULL,
  time_mode TINYINT UNSIGNED NOT NULL,
  timezone VARCHAR(64),
  response_deadline DATETIME,
  allow_multi_answers BIT NOT NULL,
  allow_answer_edits BIT NOT NULL,
  result_visibility TINYINT UNSIGNED NOT NULL,
  published BIT NOT NULL,
  code CHAR(8) DEFAULT NULL,
  first_draft DATETIME NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (admin_user) REFERENCES ${prefix}user (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  PRIMARY KEY (id)
)Engine=InnoDB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_code
  ON ${database}.${prefix}poll (code);
