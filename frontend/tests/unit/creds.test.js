/**
 * The hard gate on the whole rewrite.
 *
 * Every existing account's Ed25519 public key was derived by the legacy
 * `axb-sig-req.min.js` bundle and stored in `yasss_user.pubkey BINARY(32)`.
 * If our replacement derives anything different, users are not shown an error —
 * they are silently locked out. So this asserts byte-for-byte equality against
 * vectors that two independent oracles already agreed on
 * (see frontend/tools/gen-creds-vectors.mjs).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ed from '@noble/ed25519';
import { genCreds } from '../../src/lib/crypto/creds.js';
import { base64ToBytes, bytesToBase64, utf8 } from '../../src/lib/crypto/base64.js';

// vitest runs with cwd = frontend/; import.meta.url is not a file URL under jsdom
const vectors = JSON.parse(
  readFileSync(resolve(process.cwd(), '../docs/legacy/creds-golden-vectors.json'), 'utf8'));

describe('genCreds — golden vectors', () => {
  it('has vectors to check', () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  for (const v of vectors) {
    it(`reproduces the legacy pubkey and payload: ${v.name}`, async () => {
      const got = await genCreds(v.email, v.password, v.mfa, v.salt);
      expect(got.pubkey).toBe(v.pubkey);
      expect(got.payload).toBe(v.payload);
    });
  }
});

describe('genCreds — structural invariants', () => {
  it('installs the sha512 hook that @noble/ed25519 v3 requires', () => {
    // A module-level side effect of importing creds.js. If this regresses,
    // signing throws rather than producing wrong output — but assert it anyway
    // so the failure names the cause.
    expect(ed.hashes.sha512).toBeTypeOf('function');
  });

  it('emits creds as raw JSON with key order {email, mfa}', async () => {
    // The server verifies the signature over this literal string, and
    // AuthToken.process tries base64-decoding `creds` before falling back to
    // JSON. Reordering the keys or base64-wrapping them breaks verification.
    const { payload } = await genCreds('a@b.co', 'pw');
    const outer = JSON.parse(new TextDecoder().decode(base64ToBytes(payload)));
    expect(outer.creds).toBe('{"email":"a@b.co","mfa":""}');
  });

  it('produces a signature that verifies against the derived pubkey', async () => {
    const { payload, pubkey } = await genCreds('a@b.co', 'pw');
    const outer = JSON.parse(new TextDecoder().decode(base64ToBytes(payload)));
    const ok = ed.verify(base64ToBytes(outer.sig), utf8(outer.creds), base64ToBytes(pubkey));
    expect(ok).toBe(true);
  });

  it('derives the keypair from the password alone, ignoring the email', async () => {
    // The scrypt salt is empty at every call site, so the keypair is a pure
    // function of the password. accountReset relies on this: it signs with an
    // empty email and still recovers the same key.
    const a = await genCreds('one@example.com', 'same-password');
    const b = await genCreds('two@example.com', 'same-password');
    expect(a.pubkey).toBe(b.pubkey);
    expect(a.payload).not.toBe(b.payload); // creds differ, so the signature does
  });

  it('NFKC-normalizes the password before deriving', async () => {
    // U+FB01 LATIN SMALL LIGATURE FI normalizes to "fi" under NFKC.
    const composed = await genCreds('a@b.co', 'ﬁx');
    const decomposed = await genCreds('a@b.co', 'fix');
    expect(composed.pubkey).toBe(decomposed.pubkey);
  });

  it('round-trips base64 helpers', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 254]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
