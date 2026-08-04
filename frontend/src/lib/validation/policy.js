/**
 * Deployment policy the server publishes and the client applies.
 *
 * The password minimum is the whole of it, and it lives here rather than as a
 * constant in `forms.js` because it is an operator's decision, not a property
 * of the code: `GET /v1` reports `passwordMinLength` from `auth.password.minLength`
 * and the app adopts it at boot.
 *
 * Worth being blunt about why this is client-side. The password never reaches
 * the server — the browser derives an Ed25519 keypair from it with scrypt and
 * sends only the public key. So no amount of server-side checking could apply
 * this rule, and nothing here should be mistaken for a security boundary. It is
 * a rule an operator wants users held to, enforced at the only tier that can
 * see the value.
 *
 * Kept as module state rather than threaded through every validator so that
 * `forms.js` stays a set of pure functions with a single import; the setter and
 * the reset exist so tests can drive it explicitly instead of depending on
 * whatever a previous test happened to leave behind.
 */

/** Used until `GET /v1` says otherwise, and if it never answers. */
export const DEFAULT_PASSWORD_MIN_LENGTH = 8;

let passwordMinLength = DEFAULT_PASSWORD_MIN_LENGTH;

/** The shortest password this deployment accepts when one is being set. */
export const getPasswordMinLength = () => passwordMinLength;

/**
 * Adopt the policy the server reported.
 *
 * Anything that is not a positive integer is ignored rather than trusted — an
 * absent key on an older server, or a garbled one, should leave the default
 * standing rather than disable the rule outright.
 *
 * @param {unknown} value the `passwordMinLength` from `GET /v1`
 */
export function setPasswordMinLength(value) {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) passwordMinLength = n;
}

/** Restore the built-in default. For tests. */
export function resetPolicy() {
  passwordMinLength = DEFAULT_PASSWORD_MIN_LENGTH;
}
