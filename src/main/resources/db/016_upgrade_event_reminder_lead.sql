/*
 * A per-event override for how far ahead reminders go out.
 *
 * `reminders.leadTime` is a single global (1440 minutes by default), which
 * suits neither end of the range it has to cover: a 6am shift wants notice the
 * evening before, a week-long festival wants notice a week out.
 *
 * NULL means "use the global", which is what every existing event does -- so
 * this changes no behaviour on its own.
 *
 * INT UNSIGNED rather than SMALLINT: 65535 minutes is only 45 days, and a lead
 * time measured in months is a reasonable thing to want. The endpoint bounds it
 * to a year, which is the number worth defending rather than the column width.
 *
 * One statement, block comments only. See docs/upstream-axb-lib-db.md.
 */
ALTER TABLE ${database}.${prefix}event
  ADD COLUMN IF NOT EXISTS reminder_lead_time INT UNSIGNED DEFAULT NULL
