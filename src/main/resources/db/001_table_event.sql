CREATE TABLE IF NOT EXISTS ${database}.${prefix}event (
  id BINARY(16) NOT NULL,
  admin_user BINARY(16),
  short_description VARCHAR(255) NOT NULL,
  long_description VARCHAR(255) NOT NULL,
  first_draft DATETIME NOT NULL,
  email_on_submission BIT NOT NULL,
  allow_multiuser_signups BIT NOT NULL,
  published BIT NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (admin_user) REFERENCES ${prefix}user (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  PRIMARY KEY (id)
)Engine=InnoDB;
