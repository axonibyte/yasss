/**
 * AXB-SIG-REQ v2 on the client side.
 *
 * The canonical byte string is a contract between two implementations in two languages,
 * and neither can see the other. `SigReqV2Test` pins the Java side against the same
 * literal shape; this pins the JavaScript side. If they ever disagree, every sign-in
 * fails — and the failure looks exactly like a wrong password, which is the worst
 * available symptom.
 */
import { describe, it, expect } from 'vitest';
import * as ed from '@noble/ed25519';
import { deriveKey, publicKeyOf } from '../../src/lib/crypto/creds.js';
import { canonicalBytes, signRequest } from '../../src/lib/crypto/sigreq2.js';
import { base64ToBytes, base64UrlToBytes, bytesToBase64Url, utf8 } from '../../src/lib/crypto/base64.js';

const AUD = 'yasss.example.org';
const decode = (b64) => JSON.parse(new TextDecoder().decode(base64ToBytes(b64)));

/** Unwraps a payload into its outer envelope and parsed creds. */
function unpack(payload) {
  const outer = decode(payload);
  return { outer, creds: decode(outer.creds) };
}

describe('base64url', () => {
  it('round-trips bytes that exercise both substituted characters', () => {
    // 0x3e and 0x3f are what produce '+' and '/' in the standard alphabet, which are
    // exactly the two characters base64url replaces. A mismatch here corrupts roughly one
    // value in sixty-four — frequent enough to break users, rare enough to be
    // irreproducible.
    const bytes = new Uint8Array([0xfb, 0xef, 0xbe, 0x3e, 0x3f, 0x00, 0xff]);
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  });

  it('emits no padding and neither substituted character', () => {
    for (let n = 1; n <= 8; n++) {
      const out = bytesToBase64Url(new Uint8Array(n).fill(0xff));
      expect(out).not.toContain('=');
      expect(out).not.toContain('+');
      expect(out).not.toContain('/');
    }
  });
});

describe('the canonical message', () => {
  it('has the exact shape the server rebuilds', () => {
    // Byte-for-byte the same literal asserted in SigReqV2Test. Written out in full rather
    // than generated, so that a change on either side has to be made deliberately on both.
    const bytes = canonicalBytes({
      aud: AUD,
      sub: 'Ym9iQGV4YW1wbGUuY29t',
      acct: '',
      iat: '1785000000000',
      jti: 'AAAAAAAAAAAAAAAAAAAAAA',
      mfa: '',
    });

    expect(new TextDecoder().decode(bytes)).toBe(
      'AXB-SIG-REQ/2\n'
      + `aud=${AUD}\n`
      + 'sub=Ym9iQGV4YW1wbGUuY29t\n'
      + 'acct=\n'
      + 'iat=1785000000000\n'
      + 'jti=AAAAAAAAAAAAAAAAAAAAAA\n'
      + 'mfa=\n',
    );
  });

  it('is ASCII even for a non-ASCII address', async () => {
    const privkey = await deriveKey('pw');
    const { creds } = unpack(
      signRequest(privkey, { aud: AUD, email: 'josé@example.com' }));

    const bytes = canonicalBytes(creds);
    for (const b of bytes) expect(b).toBeLessThan(0x80);
  });
});

describe('signRequest', () => {
  it('produces a signature that verifies over the canonical bytes', async () => {
    const privkey = await deriveKey('hunter2');
    const { outer, creds } = unpack(
      signRequest(privkey, { aud: AUD, email: 'bob@example.com' }));

    expect(
      ed.verify(
        base64ToBytes(outer.sig),
        canonicalBytes(creds),
        base64ToBytes(publicKeyOf(privkey))),
    ).toBe(true);
  });

  it('draws a fresh nonce every time', async () => {
    // The single-use property rests entirely on this. A repeated nonce is not a subtle
    // weakening — the second request with it is refused, so a repeat would break sign-in
    // outright for whoever hit it.
    const privkey = await deriveKey('pw');
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const { creds } = unpack(signRequest(privkey, { aud: AUD, email: 'a@b.co' }));
      seen.add(creds.jti);
    }
    expect(seen.size).toBe(200);
  });

  it('emits a 22-character nonce, which is what the server requires exactly', async () => {
    const privkey = await deriveKey('pw');
    const { creds } = unpack(signRequest(privkey, { aud: AUD, email: 'a@b.co' }));
    expect(creds.jti).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('signs a different message each time even for identical inputs', async () => {
    // Ed25519 is deterministic, so without the nonce and timestamp two sign-ins would be
    // byte-identical and indistinguishable from a replay.
    const privkey = await deriveKey('pw');
    const a = signRequest(privkey, { aud: AUD, email: 'a@b.co', now: 1785000000000 });
    const b = signRequest(privkey, { aud: AUD, email: 'a@b.co', now: 1785000000000 });
    expect(a).not.toBe(b);
  });

  it('carries every field even when empty', async () => {
    // JSON.stringify drops an undefined value, so a field that is sometimes present
    // changes the shape of what is signed.
    const privkey = await deriveKey('pw');
    const { creds } = unpack(signRequest(privkey, { aud: AUD, email: 'a@b.co' }));

    expect(Object.keys(creds).sort()).toEqual(
      ['acct', 'aud', 'iat', 'jti', 'mfa', 'sub', 'v'].sort());
    expect(creds.acct).toBe('');
    expect(creds.mfa).toBe('');
  });

  it('base64url-encodes the address under sub', async () => {
    const privkey = await deriveKey('pw');
    const { creds } = unpack(signRequest(privkey, { aud: AUD, email: 'bob@example.com' }));
    expect(new TextDecoder().decode(base64UrlToBytes(creds.sub))).toBe('bob@example.com');
    expect(creds.sub).toBe(bytesToBase64Url(utf8('bob@example.com')));
  });

  it('sends creds as base64, unlike v1', async () => {
    // v1 sends raw JSON and the server falls back to parsing it; v2 takes the base64 path
    // the server tries first.
    const privkey = await deriveKey('pw');
    const { outer } = unpack(signRequest(privkey, { aud: AUD, email: 'a@b.co' }));
    expect(() => decode(outer.creds)).not.toThrow();
  });

  it('refuses to name both an email and an account, or neither', async () => {
    const privkey = await deriveKey('pw');
    expect(() => signRequest(privkey, { aud: AUD })).toThrow();
    expect(
      () => signRequest(privkey, { aud: AUD, email: 'a@b.co', account: 'x' })).toThrow();
  });

  it('stamps the timestamp it is given, so a skewed client can correct', async () => {
    const privkey = await deriveKey('pw');
    const { creds } = unpack(
      signRequest(privkey, { aud: AUD, email: 'a@b.co', now: 1785000000123 }));
    expect(creds.iat).toBe('1785000000123');
  });
});
