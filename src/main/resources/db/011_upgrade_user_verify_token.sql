/*
 * A durable token for the email-verification link.
 *
 * The link previously carried a TicketEngine signature. Those signers live in
 * an in-memory deque, rotate every ticket.refreshInterval minutes keeping
 * ticket.maxHistory of them (1 x 15 by default) and are lost entirely on
 * restart -- so a verification email was dead roughly fifteen minutes after it
 * was sent, and immediately on any deploy. A link mailed to a human has to work
 * whenever they get round to opening it.
 *
 * Nullable: existing users may have no pending verification, and one is minted
 * whenever a link is sent.
 *
 * One statement, block comments only. See docs/upstream-axb-lib-db.md.
 */
ALTER TABLE ${database}.${prefix}user
  ADD COLUMN IF NOT EXISTS verify_token BINARY(16) DEFAULT NULL
