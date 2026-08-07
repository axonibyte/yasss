/**
 * AXB-SIG-REQ v2: the credential payload, with a timestamp and a single-use nonce.
 *
 * v1 signs `JSON.stringify({email, mfa})`, which for an account without MFA is
 * byte-identical forever — so the signature over it is too, and a captured
 * `Authorization` header is a credential that never expires. It is also deliberately
 * exempt from `session_epoch`, so no revocation the application offers can withdraw it.
 *
 * v2 signs a message that goes stale and can be spent only once.
 *
 * The signed bytes are NOT the JSON that goes over the wire. Both sides build the same
 * canonical byte string from the same values, and the server rebuilds it from what it
 * parsed rather than trusting the framing it received — so "what was signed" and "what is
 * acted on" cannot drift apart. Everything in it is ASCII, which is why the address
 * travels base64url rather than as text.
 *
 * Field order and spelling are load-bearing on both sides. See `SigReqV2.java`.
 */
import * as ed from '@noble/ed25519';
import { bytesToBase64, bytesToBase64Url, randomBytes, utf8 } from './base64.js';

/** The 16-byte nonce, base64url — 22 characters, which the server requires exactly. */
function newNonce() {
  return bytesToBase64Url(randomBytes(16));
}

/**
 * The exact bytes the signature covers.
 *
 * Seven lines, fixed order, every one LF-terminated. Unambiguous without length prefixes
 * because the server refuses any value containing an LF before it builds this.
 */
export function canonicalBytes({ aud, sub, acct, iat, jti, mfa }) {
  return utf8(
    `AXB-SIG-REQ/2\n`
    + `aud=${aud}\n`
    + `sub=${sub}\n`
    + `acct=${acct}\n`
    + `iat=${iat}\n`
    + `jti=${jti}\n`
    + `mfa=${mfa}\n`,
  );
}

/**
 * Signs a v2 credential.
 *
 * @param {Uint8Array} privkey the Ed25519 seed derived from the password
 * @param {object} opts
 * @param {string} opts.aud the audience, as published by `GET /v1`
 * @param {string} [opts.email] the address, when addressing by email
 * @param {string} [opts.account] the account UUID, when addressing by id
 * @param {string} [opts.mfa] a TOTP code
 * @param {number} [opts.now] epoch millis to stamp; defaults to the local clock
 * @returns {string} the value for `Authorization: AXB-SIG-REQ <payload>`
 */
export function signRequest(privkey, { aud, email, account, mfa = '', now = Date.now() }) {
  // Exactly one addressing mode. Both, or neither, is refused by the server rather than
  // guessed at, so it is refused here too instead of being papered over.
  const sub = email ? bytesToBase64Url(utf8(email)) : '';
  const acct = account ?? '';
  if (!!sub === !!acct) {
    throw new Error('a credential must name exactly one of an email or an account');
  }

  const fields = { aud, sub, acct, iat: String(Math.floor(now)), jti: newNonce(), mfa };
  const sig = bytesToBase64(ed.sign(canonicalBytes(fields), privkey));

  // The envelope is unchanged from v1, and `creds` is base64 here rather than raw JSON —
  // the server tries base64 first and falls back, so v2 takes the fast path while v1 keeps
  // the fallback it has always needed.
  const creds = bytesToBase64(utf8(JSON.stringify({ v: 2, ...fields })));

  return bytesToBase64(utf8(JSON.stringify({ creds, sig })));
}
