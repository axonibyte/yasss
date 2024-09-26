CREATE TABLE IF NOT EXISTS ${database}.${prefix}rsvp (
  activity BINARY(16) NOT NULL,
  event_window BINARY(16) NOT NULL,
  volunteer BINARY(16) NOT NULL,
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
  FOREIGN KEY (volunteer) REFERENCES ${prefix}volunteer (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (activity, event_window, volunteer)
)Engine=InnoDB;
