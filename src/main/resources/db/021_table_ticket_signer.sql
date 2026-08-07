/*
 * Durable storage for the ticket engine's signing keys.
 *
 * The signers lived only in an in-memory deque, so every restart invalidated
 * every session on the platform. A deploy logged out the entire user base, and
 * with the shipped ticket.refreshInterval of one minute and ticket.maxHistory of
 * fifteen, a session died after fifteen minutes of inactivity even without one.
 *
 * `privkey` holds what Credentialed.getEncPrivkey() returns: the Ed25519 private
 * key, AES-GCM encrypted under ticket.globalSecret. Both of the consequences
 * originally recorded here changed at axb-lib-auth-java 0.1.0, and the old ones
 * are kept because rows written under them are still in this table.
 *
 *   - the nonce is now random and travels inside the stored blob, so the
 *     signer's id is no longer key material and a row restored under the wrong
 *     id decrypts fine. Ids still have to round-trip exactly, because a ticket
 *     names its signer and TicketEngine.verify resolves it by id -- but that is
 *     now enforced by TicketEngineKidTest rather than caught incidentally at
 *     load. Rows written before the change ARE keyed to the id; the library
 *     reads both formats.
 *
 *   - with ticket.globalSecret unset, Credentialed now refuses to produce a key
 *     at all rather than returning it unencrypted, and YasssCore refuses to boot
 *     without the secret in any case. So this column can no longer hold a raw
 *     signing key by that route. TicketSigner.persistenceAllowed still refuses
 *     the shipped placeholder, which is a real key published in the source tree.
 *
 * A current-format value is 61 bytes against VARBINARY(255). Read TicketSigner
 * and docs/upstream-axb-lib-auth.md before changing this table.
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
