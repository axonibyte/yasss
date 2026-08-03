/*
 * Give a volunteer a reminder address and a consent state of its own.
 *
 * reminders_enabled has existed since 004 and has never been consumable,
 * because a Volunteer has no email address anywhere. Its `user` column is
 * nullable -- anonymous signup is a first-class path -- so User.getEmail()
 * reaches only a minority of rows.
 *
 * The two columns mean different things and both are required to send.
 * reminders_enabled stays the volunteer's INTENT; reminder_state is the
 * CONSENT fact:
 *   0 NONE   1 PENDING   2 CONFIRMED   3 UNSUBSCRIBED
 *
 * reminder_token is a durable per-row secret backing the confirm and
 * unsubscribe links. It deliberately does not use TicketEngine: those signers
 * live in an in-memory deque, roll every ticket.refreshInterval minutes and
 * retain only ticket.maxHistory of them (defaults 1 x 15, so about a fifteen
 * minute window), and are lost entirely on restart. An unsubscribe link has to
 * work months later.
 *
 * Database.setup replays every script on every boot and tracks nothing, so
 * ADD COLUMN IF NOT EXISTS is mandatory. It also prepares and executes the
 * whole file as a SINGLE statement, which is why all three columns are added
 * by one ALTER rather than three.
 *
 * NOTE: block comments, not `--`. setup() joins the lines of a script with a
 * single space and discards the newlines, so a `--` comment silently comments
 * out everything after it and the statement executes as a no-op with no error
 * at all. See 006.
 */
ALTER TABLE ${database}.${prefix}volunteer
  ADD COLUMN IF NOT EXISTS reminder_email VARCHAR(255)
    AFTER reminders_enabled,
  ADD COLUMN IF NOT EXISTS reminder_state TINYINT UNSIGNED NOT NULL DEFAULT 0
    AFTER reminder_email,
  ADD COLUMN IF NOT EXISTS reminder_token BINARY(16)
    AFTER reminder_state;
