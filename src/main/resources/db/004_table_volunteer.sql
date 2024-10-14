CREATE TABLE IF NOT EXISTS ${database}.${prefix}volunteer (
  id BINARY(16) NOT NULL,
  user BINARY(16),
  event BINARY(16) NOT NULL,
  name VARCHAR(255) NOT NULL,
  reminders_enabled BIT NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (event) REFERENCES ${prefix}event (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (id)
)Engine=InnoDB;
