CREATE TABLE IF NOT EXISTS ${database}.${prefix}detail (
  id BINARY(16) NOT NULL,
  event BINARY(16) NOT NULL,
  detail_type TINYINT UNSIGNED NOT NULL,
  label VARCHAR(255) NOT NULL,
  hint VARCHAR(255) NOT NULL,
  priority TINYINT UNSIGNED NOT NULL,
  required BIT NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (event) REFERENCES ${prefix}event (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (id)
)Engine=InnoDB;
