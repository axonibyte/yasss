/*
 * Durable storage for the ticket engine's signing keys.
 *
 * The signers lived only in an in-memory deque, so every restart invalidated
 * every session on the platform. A deploy logged out the entire user base, and
 * with the shipped ticket.refreshInterval of one minute and ticket.maxHistory of
 * fifteen, a session died after fifteen minutes of inactivity even without one.
 *
 * `privkey` holds what Credentialed.getEncPrivkey() returns, which is the
 * Ed25519 private key AES-GCM encrypted under ticket.globalSecret with the
 * signer's own id as the IV. Two consequences, both load-bearing:
 *
 *   - a signer must be restored under exactly the id it was stored with, or the
 *     GCM tag fails and it silently stops verifying; and
 *   - when ticket.globalSecret is unset, Credentialed's crypto helper is the
 *     identity function, so this column would hold the raw signing key. That is
 *     why TicketSigner.persistenceAllowed refuses to write anything at all
 *     without a real secret. Read TicketSigner before changing this table.
 *
 * `created_at` is epoch milliseconds rather than a TIMESTAMP: it is compared
 * against System.currentTimeMillis() for retention, and a round trip through the
 * session time zone is one more thing to get wrong. Indexed because pruning
 * orders by it.
 *
 * One statement, block comments only -- house style; see
 * docs/upstream-axb-lib-db.md.
 */
CREATE TABLE IF NOT EXISTS ${database}.${prefix}ticket_signer (
  id BINARY(16) NOT NULL,
  pubkey BINARY(32) NOT NULL,
  privkey VARBINARY(255) NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_ticket_signer_created (created_at)
)Engine=InnoDB
