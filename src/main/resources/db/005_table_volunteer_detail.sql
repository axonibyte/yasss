CREATE TABLE IF NOT EXISTS ${database}.${prefix}volunteer_detail (
  volunteer BINARY(16) NOT NULL,
  detail_field BINARY(16) NOT NULL,
  detail_value VARCHAR(255) NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (volunteer) REFERENCES ${prefix}volunteer (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (detail_field) REFERENCES ${prefix}detail_field (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (volunteer, detail_field)
)Engine=InnoDB;
