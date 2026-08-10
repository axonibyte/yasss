/*
 * A respondent's answer to one of the poll's custom questions.
 *
 * The same shape as `volunteer_detail` (005), for the same reason `poll_detail`
 * has the same shape as `detail`: it is the same idea against a different
 * parent, and the frontend renders both through one set of components.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}poll_response_detail (
  response BINARY(16) NOT NULL,
  detail_field BINARY(16) NOT NULL,
  detail_value VARCHAR(255) NOT NULL,
  last_update TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    NOT NULL,
  FOREIGN KEY (response) REFERENCES ${prefix}poll_response (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (detail_field) REFERENCES ${prefix}poll_detail (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  PRIMARY KEY (response, detail_field)
)Engine=InnoDB;
