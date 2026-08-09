/*
 * Enrolled WebAuthn credentials.
 *
 * A passkey is bound to its relying party for life -- see RelyingPartyConfig,
 * and note that an RP ID may not be an IP address, which the shipped api.host
 * is. Read PasskeyVerifier before changing anything here.
 *
 * NO user_handle COLUMN, deliberately. `user.id` IS the handle: sixteen opaque
 * random bytes, which is exactly what the spec asks for. Using the email would
 * be a privacy defect -- the handle is stored on the authenticator and is
 * returned in an assertion BEFORE authentication, so it is readable by anyone
 * who can prompt the device.
 *
 * `credential_id` is UNIQUE globally rather than per user. A usernameless
 * assertion arrives carrying only a credential id, so two accounts holding the
 * same one would make the lookup ambiguous; it is a spec violation besides. The
 * spec permits up to 1023 bytes and real authenticators emit 16 to 64, so 255 is
 * generous -- but the endpoint refuses anything longer rather than letting it
 * overflow into a 500. That is the lesson already recorded on
 * APIEndpoint.validPubkey, where well-formed base64 of the wrong length
 * overflowed BINARY(32).
 *
 * `sign_count` is a clone-detection signal and nothing more. Most platform
 * authenticators -- iCloud Keychain, Google Password Manager, a synced Windows
 * Hello credential -- return 0 always, because a credential that exists on
 * several devices has no single counter to advance. The rule that is both
 * specified and safe: if stored and received are both 0, skip the check;
 * otherwise require received > stored. What must never happen is refusing a
 * login because 0 is not greater than 0, which is the obvious way to lock out
 * most of the user base. PasskeyCounterTest owns that matrix, because the
 * browser tier cannot produce a zero-counter authenticator.
 *
 * `rp_id` costs nothing and turns the worst failure into a message. Change
 * api.host and every enrolled passkey stops working with no server-side
 * explanation; with this column the server can say which relying party a
 * credential was enrolled under.
 *
 * `backup_eligible` and `backup_state` are the BE and BS authenticator-data
 * flags. They answer "is this synced to a cloud, or does it live on one device
 * only?" -- which is the difference between "safe to turn your password off" and
 * "losing this laptop loses your account", and is what gates that switch.
 *
 * ON DELETE CASCADE interacts with an existing side effect worth knowing about:
 * User.commit reconciles pending email addresses by deleting other users whose
 * pending_email matches a newly verified one. With the cascade that now takes
 * their passkeys too. Correct -- the account is being destroyed -- but it means
 * enrollment is refused on an account with no verified email; see
 * PasskeyRegistrationEndpoint.
 *
 * Block comments deliberately -- see the note in 006.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}passkey (
  id BINARY(16) NOT NULL,
  user BINARY(16) NOT NULL,
  credential_id VARBINARY(255) NOT NULL,
  public_key VARBINARY(512) NOT NULL,
  rp_id VARCHAR(255) NOT NULL,
  sign_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports VARCHAR(255) DEFAULT NULL,
  aaguid BINARY(16) DEFAULT NULL,
  label VARCHAR(255) DEFAULT NULL,
  backup_eligible BIT NOT NULL DEFAULT 0,
  backup_state BIT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  last_used BIGINT DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_passkey_credential (credential_id),
  FOREIGN KEY (user) REFERENCES ${prefix}user (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
)Engine=InnoDB
