CREATE TABLE IF NOT EXISTS ${database}.${prefix}activity (
  id BINARY(16) NOT NULL,
  event BINARY(16) NOT NULL,
  short_description VARCHAR(255) NOT NULL,
  long_description VARCHAR(255) NOT NULL,
  max_activity_volunteers TINYINT UNSIGNED NOT NULL,
  max_slot_volunteers_default TINYINT UNSIGNED NOT NULL,
  priority TINYINT UNSIGNED NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (event) REFERENCES ${prefix}event (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (id)
)Engine=InnoDB;
