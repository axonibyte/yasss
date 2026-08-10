/*
 * The short-code allocator, for every kind of thing a code can name.
 *
 * One input box resolves both events and polls -- a visitor typing a code off a
 * flyer does not know or care which they have -- so the two must not be able to
 * mint the same eight characters. Per-table unique indexes cannot deliver that.
 * They make a cross-kind collision *legal*, and the resolver then has to try one
 * kind and fall back to the other, which deterministically hides whichever it
 * tries second: no error, no log, and a code printed on paper that opens
 * somebody else's thing. Forty bits makes that rare. It does not make it
 * impossible, and "rare" is not a property you can debug.
 *
 * A shared table makes the collision a duplicate-key violation instead, which
 * is a thing the retry loop in Event.commit already knows how to handle -- and
 * which keeps that method's own comment true: "the unique index is the
 * authority, so a collision is a duplicate-key violation to catch, not a race
 * to lose."
 *
 * The uniqueness on `code` is a NAMED index rather than the primary key,
 * deliberately. AccessCode.isCodeCollision matches on the index name so that a
 * duplicate on some other constraint is not silently retried into a different
 * failure, and "PRIMARY" is far too broad a thing to match on.
 *
 * The primary key is (kind, target) rather than (code): it is what makes a
 * second claim for one target an error rather than a second row, so a thing
 * cannot come to hold two codes.
 *
 * `target` carries no foreign key, because it points at two tables. Releasing a
 * code is therefore the application's job, in Event.delete and Poll.delete. A
 * row that leaks because a process died between the two statements burns one
 * code out of a trillion and harms nothing; inventing a polymorphic join table
 * to express a foreign key that cannot exist would cost a great deal more than
 * that.
 *
 * `event.code` and `poll.code` stay where they are, as display copies. This
 * table is the allocator; those are the read path, already indexed and already
 * on every projection. A code is assigned once and never reissued, so the two
 * cannot drift.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}access_code (
  code CHAR(8) NOT NULL,
  kind TINYINT UNSIGNED NOT NULL,
  target BINARY(16) NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  PRIMARY KEY (kind, target)
)Engine=InnoDB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_code
  ON ${database}.${prefix}access_code (code);
