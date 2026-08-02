/**
 * Client-side mirrors of the server's detail-type patterns.
 *
 * `model/Detail.java:63-65` applies these with `Matcher.matches()`, which is
 * implicitly fully anchored, and compiles them without CASE_INSENSITIVE.
 * The legacy client regexes were UNANCHORED and therefore disagreed with the
 * server in both directions:
 *
 *   - "hello foo@bar.com world" passed the client, then 400'd server-side
 *   - "BOB@EXAMPLE.COM" failed the client, and would have 400'd server-side too
 *
 * Anchoring them is not merely a bug fix — it makes the two tiers agree.
 * See docs/legacy/01-behavior.md §3.1 and 03-api-contract.md §3.
 */

/**
 * Lowercase-only by design: the server's pattern has no CASE_INSENSITIVE flag,
 * so `Foo@Bar.com` is a genuine 400. Inputs auto-lowercase on blur rather than
 * loosening this, so the rule never becomes a trap.
 */
export const EMAIL =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Non-negative, and despite the name it permits up to 9 decimal places —
 * that is the server's pattern, so the message says "number", not "integer".
 */
export const INTEGER = /^\d+(\.\d{0,9})?$/;

export const PHONE =
  /^(\+?( |-|\.)?\d{1,2}( |-|\.)?)?(\(?\d{3}\)?|\d{3})( |-|\.)?(\d{3}( |-|\.)?\d{4})$/;

export const BOOLEAN = /^(true|false)$/;

/** Account email addresses use the same rule as EMAIL details. */
export const ACCOUNT_EMAIL = EMAIL;
