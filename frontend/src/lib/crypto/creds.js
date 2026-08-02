/**
 * AXB-SIG-REQ credential derivation.
 *
 * Replaces the vendored `axb-sig-req.min.js` browserify bundle (74 KB, global
 * `window.genCreds`). The output is byte-for-byte identical — it has to be:
 * every existing account's Ed25519 public key is stored server-side in
 * `yasss_user.pubkey BINARY(32)`, so any deviation silently locks users out.
 *
 * Verified against two independent oracles (the legacy bundle and
 * node:crypto/OpenSSL) by `tools/gen-creds-vectors.mjs`; the resulting vectors
 * live in `docs/legacy/creds-golden-vectors.json` and gate `creds.test.js`.
 *
 * Normative details that must not be "cleaned up":
 *   - the scrypt salt is EMPTY at every call site, so the keypair is a pure
 *     function of the password
 *   - `creds` key order is exactly {"email":…,"mfa":…}; the server verifies the
 *     signature over that literal string
 *   - `creds` is sent as raw JSON, not base64; the server tries base64 first and
 *     falls back to JSON parsing, and our payload never looks like base64
 *
 * See docs/legacy/03-api-contract.md §4b.
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import scryptJs from 'scrypt-js'; // CJS — no named exports under Node ESM
import { bytesToBase64, utf8 } from './base64.js';

// @noble/ed25519 v3 ships no hash implementation; wire one up before first use.
// This is a module-level side effect — keep this module eagerly imported.
ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = async (...m) => sha512(...m);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_DKLEN = 32;

const scrypt = scryptJs.scrypt;

const nfkc = (s) => s.normalize('NFKC');

/**
 * Derive an Ed25519 keypair from a password and sign a credential payload.
 *
 * @param {string} email
 * @param {string} password
 * @param {string} [mfa]   always '' in this application
 * @param {string} [salt]  always '' in this application — see the note above
 * @returns {Promise<{payload: string, pubkey: string}>}
 *   `payload` goes in `Authorization: AXB-SIG-REQ <payload>`;
 *   `pubkey` is what gets registered with the server.
 */
export async function genCreds(email, password, mfa = '', salt = '') {
  const privkey = await scrypt(
    utf8(nfkc(password)),
    utf8(nfkc(salt)),
    SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN);

  const pubkey = bytesToBase64(ed.getPublicKey(privkey));

  const creds = nfkc(JSON.stringify({ email, mfa }));
  const sig = bytesToBase64(ed.sign(utf8(creds), privkey));

  // the outer normalize is redundant (idempotent) but the legacy bundle did it
  const payload = bytesToBase64(utf8(nfkc(JSON.stringify({ creds, sig }))));

  return { payload, pubkey };
}
