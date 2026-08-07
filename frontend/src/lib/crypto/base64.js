/**
 * Base64 helpers over Uint8Array, using the standard (padded) alphabet.
 *
 * The legacy implementation went through Node's `Buffer` inside a browserify
 * shim. These produce byte-identical output in the browser without it.
 */

/** @param {Uint8Array} bytes */
export function bytesToBase64(bytes) {
  let binary = '';
  // chunked to avoid blowing the argument limit on large inputs
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** @param {string} b64 */
export function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** UTF-8 encode, matching `Buffer.from(str)` in the legacy bundle. */
export const utf8 = (str) => new TextEncoder().encode(str);


/**
 * base64url, unpadded -- the alphabet AXB-SIG-REQ v2 uses for every binary field.
 *
 * Built on the standard pair above rather than as a second implementation. What it
 * encodes is a credential id and an email address, so a mismatched alphabet would corrupt
 * roughly one value in sixty-four -- often enough to be a real bug, rarely enough that
 * nobody can reproduce it.
 *
 * @param {Uint8Array} bytes
 */
export function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** @param {string} b64u */
export function base64UrlToBytes(b64u) {
  const padded = b64u.replaceAll('-', '+').replaceAll('_', '/');
  // atob wants a length that is a multiple of four; base64url drops the padding.
  return base64ToBytes(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

/** Cryptographically random bytes, for a nonce that must not repeat. */
export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}
