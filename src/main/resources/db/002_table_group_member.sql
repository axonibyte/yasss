CREATE TABLE IF NOT EXISTS ${database}.${prefix}group_member (
  user_group BINARY(16) NOT NULL,
  user BINARY(16) NOT NULL,
  role TINYINT UNSIGNED NOT NULL,
  personal_alert BIT NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  PRIMARY KEY (user_group, user),
  FOREIGN KEY (user_group) REFERENCES ${prefix}user_group (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (user) REFERENCES ${prefix}user (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
)Engine=InnoDB;
