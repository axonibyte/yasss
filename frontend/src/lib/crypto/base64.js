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

