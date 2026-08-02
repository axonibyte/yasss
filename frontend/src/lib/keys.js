/**
 * Stable client-side identity for entities.
 *
 * Entities need an identity before the server gives them one — the creation
 * wizard builds a whole event graph with no ids at all. Every entity therefore
 * carries an immutable `key` minted here, plus a nullable `id` filled in once
 * it is persisted. Internal references (slot lookup, RSVP membership, the
 * selected volunteer) use `key`; only the serialization layer touches `id`.
 */
let seq = 0;

/** @param {string} prefix short type tag, for readability in dev tools */
export const mintKey = (prefix) => `${prefix}${++seq}`;

/** Test helper — makes key sequences deterministic across cases. */
export const resetKeys = () => { seq = 0; };
