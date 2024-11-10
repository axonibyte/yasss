ALTER TABLE ${database}.${prefix}volunteer
  ADD COLUMN IF NOT EXISTS
  ip_addr INT UNSIGNED
  AFTER reminders_enabled;
