/*
 * Pin every text column to utf8mb4.
 *
 * Nothing in this schema ever named a character set: every CREATE TABLE ends in
 * a bare `)Engine=InnoDB;`, and the JDBC URL the driver library builds carries
 * no `characterEncoding` either. So every VARCHAR inherited the table default,
 * which inherited the schema default, which inherited whatever the server
 * happened to be configured with.
 *
 * On a MariaDB before 11.6 that default is latin1, and the consequences are not
 * subtle: an event titled with an emoji, a volunteer with a CJK name, or any of
 * the astral-plane values the fuzz corpus pushes through is either rejected with
 * `Incorrect string value` -- surfacing as a 500 and "database malfunction" --
 * or silently stored as `?`. The test image happens to default to utf8mb4,
 * which is precisely why this went unnoticed: the suite proved nothing about the
 * servers this actually deploys to. e2e/run.sh now starts MariaDB with
 * `--character-set-server=latin1` so that it does.
 *
 * The ALTER DATABASE is not redundant with the per-table ALTERs; it is what
 * makes any table added after this one inherit the right default.
 *
 * WHY THE GUARDS
 *
 * `CONVERT TO CHARACTER SET` is idempotent in its result but not in its cost:
 * it forces an ALGORITHM=COPY rebuild of the whole table whether or not there
 * is anything to convert. Database.setup tracks nothing and replays every
 * script on every boot, so an unguarded version would rebuild all eight tables
 * on every single start, forever. Each block therefore checks
 * information_schema first and prepares `DO 0` -- a statement that does
 * nothing -- when there is no work.
 *
 * e2e/run.sh asserts this directly: it captures CREATE_TIME before the restart
 * that proves the migrations are re-runnable and compares it after, because a
 * rebuild bumps CREATE_TIME. If a guard ever breaks, that assertion fails
 * rather than the cost quietly reappearing.
 *
 * A NOTE ON INDEX KEY LENGTH
 *
 * `reminder_suppression` has PRIMARY KEY (email VARCHAR(255)), which is 1020
 * bytes once each character can take four. That fits InnoDB's DYNAMIC row
 * format (3072-byte limit) and does not fit COMPACT (767). DYNAMIC has been the
 * default since MariaDB 10.2 and none of these tables names a ROW_FORMAT, so
 * this is safe -- and run.sh asserts the row format so that it stays safe.
 *
 * COLLATION
 *
 * utf8mb4_unicode_ci, matching latin1_swedish_ci in being case-insensitive so
 * that no comparison changes sense. It does equate a few pairs latin1 did not
 * (ß with ss, most notably), which could in principle collide two rows in
 * reminder_suppression's primary key during conversion. Addresses there are
 * lowercased and pass an ASCII-only pattern before they are stored, so this is
 * theoretical rather than a risk being accepted.
 *
 * Block comments deliberately -- see the note in 006.
 */
SET @yasss_db_conv = IF(
  (SELECT DEFAULT_CHARACTER_SET_NAME
     FROM information_schema.SCHEMATA
    WHERE SCHEMA_NAME = '${database}') = 'utf8mb4',
  'DO 0',
  'ALTER DATABASE `${database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE yasss_conv FROM @yasss_db_conv;
EXECUTE yasss_conv;
DEALLOCATE PREPARE yasss_conv;

SET @yasss_conv_user = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = '${database}' AND TABLE_NAME = '${prefix}user'
      AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> 'utf8mb4') = 0,
  'DO 0',
  'ALTER TABLE `${database}`.`${prefix}user` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE yasss_conv FROM @yasss_conv_user;
EXECUTE yasss_conv;
DEALLOCATE PREPARE yasss_conv;

SET @yasss_conv_event = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = '${database}' AND TABLE_NAME = '${prefix}event'
      AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> 'utf8mb4') = 0,
  'DO 0',
  'ALTER TABLE `${database}`.`${prefix}event` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE yasss_conv FROM @yasss_conv_event;
EXECUTE yasss_conv;
DEALLOCATE PREPARE yasss_conv;

SET @yasss_conv_activity = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = '${database}' AND TABLE_NAME = '${prefix}activity'
      AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> 'utf8mb4') = 0,
  'DO 0',
  'ALTER TABLE `${database}`.`${prefix}activity` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE yasss_conv FROM @yasss_conv_activity;
EXECUTE yasss_conv;
DEALLOCATE PREPARE yasss_conv;

SET @yasss_conv_detail = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = '${database}' AND TABLE_NAME = '${prefix}detail'
      AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> 'utf8mb4') = 0,
  'DO 0',
  'ALTER TABLE `${database}`.`${prefix}detail` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE yasss_conv FROM @yasss_conv_detail;
EXECUTE yasss_conv;
DEALLOCATE PREPARE yasss_conv;

SET @yasss_conv_volunteer = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = '${database}' AND TABLE_NAME = '${prefix}volunteer'
      AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> 'utf8mb4') = 0,
  'DO 0',
  'ALTER TABLE `${database}`.`${prefix}volunteer` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE yasss_conv FROM @yasss_conv_volunteer;
EXECUTE yasss_conv;
DEALLOCATE PREPARE yasss_conv;

SET @yasss_conv_volunteer_detail = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = '${database}' AND TABLE_NAME = '${prefix}volunteer_detail'
      AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> 'utf8mb4') = 0,
  'DO 0',
  'ALTER TABLE `${database}`.`${prefix}volunteer_detail` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE yasss_conv FROM @yasss_conv_volunteer_detail;
EXECUTE yasss_conv;
DEALLOCATE PREPARE yasss_conv;

SET @yasss_conv_checkout_session = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = '${database}' AND TABLE_NAME = '${prefix}checkout_session'
      AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> 'utf8mb4') = 0,
  'DO 0',
  'ALTER TABLE `${database}`.`${prefix}checkout_session` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE yasss_conv FROM @yasss_conv_checkout_session;
EXECUTE yasss_conv;
DEALLOCATE PREPARE yasss_conv;

SET @yasss_conv_reminder_suppression = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = '${database}' AND TABLE_NAME = '${prefix}reminder_suppression'
      AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> 'utf8mb4') = 0,
  'DO 0',
  'ALTER TABLE `${database}`.`${prefix}reminder_suppression` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE yasss_conv FROM @yasss_conv_reminder_suppression;
EXECUTE yasss_conv;
DEALLOCATE PREPARE yasss_conv;
