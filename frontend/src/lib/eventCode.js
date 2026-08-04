/**
 * Short, human-copyable event codes.
 *
 * The mirror of `com.crowdease.yasss.model.EventCode`. Two implementations of
 * the same rule is a drift hazard, so a shared table of cases is asserted
 * against both — see `tests/unit/eventCode.test.js` and `EventCodeTest.java`,
 * the same arrangement `CredentialInteropTest` uses to pin crypto across
 * languages.
 *
 * Crockford Base32, whose alphabet omits I, L, O and U and whose decoding folds
 * the characters people confuse into the ones that survive. Reading a code
 * aloud and writing it down cannot produce a different code.
 */

/** The encoding alphabet. Note the absent I, L, O and U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** How many symbols a code has. */
export const CODE_LENGTH = 8;

/**
 * Puts a user-supplied spelling of a code into canonical form.
 *
 * Uppercase, fold the ambiguous characters, then drop everything outside the
 * alphabet — which is what makes separators and stray punctuation irrelevant.
 * `abcd-efgh`, `ABCD EFGH` and `a.b.c.d.e.f.g.h` are all one code.
 *
 * @param {unknown} raw the code as typed, pasted or read out
 * @returns {string|null} the canonical form, or null if it is not a code
 */
export function normalizeCode(raw) {
  if (typeof raw !== 'string') return null;

  let out = '';
  for (const char of raw.toUpperCase()) {
    const folded = char === 'O' ? '0' : (char === 'I' || char === 'L' ? '1' : char);
    if (ALPHABET.includes(folded)) out += folded;
  }
  return out.length === CODE_LENGTH ? out : null;
}

/**
 * Whether a string is a code in any spelling.
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
export const isCode = (raw) => normalizeCode(raw) !== null;

/**
 * Renders a canonical code for display.
 *
 * The hyphen is presentation only — it is never stored and never queried.
 *
 * @param {unknown} code
 * @returns {string|null} the code as `XXXX-XXXX`, or null if there is none
 */
export function formatCode(code) {
  const canonical = normalizeCode(code);
  return canonical === null ? null : `${canonical.slice(0, 4)}-${canonical.slice(4)}`;
}
