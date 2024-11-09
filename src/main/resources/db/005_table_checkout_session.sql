CREATE TABLE IF NOT EXISTS ${database}.${prefix}checkout_session (
  event BINARY(16) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (event) REFERENCES ${prefix}event (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
)Engine=InnoDB;
