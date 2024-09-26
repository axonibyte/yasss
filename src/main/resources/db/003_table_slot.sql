CREATE TABLE IF NOT EXISTS ${database}.${prefix}slot (
  activity BINARY(16) NOT NULL,
  event_window BINARY(16) NOT NULL,
  max_slot_volunteers TINYINT UNSIGNED NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (activity) REFERENCES ${prefix}activity (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (event_window) REFERENCES ${prefix}event_window (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (activity, event_window)
)Engine=InnoDB;
