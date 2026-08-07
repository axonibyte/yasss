/**
 * The browser side of WebAuthn.
 *
 * Two properties, both of which fail in ways that are hard to attribute.
 *
 * Encoding: every field of the ceremony crosses as base64 and comes back as an
 * `ArrayBuffer`. A mismatch corrupts a credential id for roughly one value in sixty-four
 * — frequent enough to break real users, rare enough that nobody can reproduce it.
 *
 * Cancellation: `navigator.credentials` rejects with `NotAllowedError` for user
 * cancellation *and* for timeout, indistinguishably. Treating that as a failure means a
 * red toast every time somebody presses Escape.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { authenticate, isSupported, register, PasskeyError } from '../../src/lib/crypto/webauthn.js';
import { bytesToBase64 } from '../../src/lib/crypto/base64.js';

const b64 = (n, fill) => bytesToBase64(new Uint8Array(n).fill(fill));

/** Minimal options in the shape the server returns. */
const regOptions = () => ({
  challenge: b64(32, 1),
  rpID: 'yasss.example.org',
  rpName: 'Yasss!',
  userHandle: b64(16, 2),
  userName: 'bob@example.com',
  excludeCredentials: [b64(16, 3)],
});

const authOptions = () => ({ challenge: b64(32, 4), rpID: 'yasss.example.org' });

function stubCredentials(impl) {
  globalThis.PublicKeyCredential = function () {};
  globalThis.navigator ??= {};
  Object.defineProperty(globalThis.navigator, 'credentials', {
    value: impl, configurable: true, writable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.PublicKeyCredential;
});

describe('isSupported', () => {
  it('is false when the API is absent', () => {
    delete globalThis.PublicKeyCredential;
    expect(isSupported()).toBe(false);
  });

  it('is true when both halves of the API exist', () => {
    stubCredentials({ create: () => {}, get: () => {} });
    expect(isSupported()).toBe(true);
  });
});

describe('register', () => {
  it('decodes what the server sent and encodes what the device returned', async () => {
    let seen = null;
    stubCredentials({
      create: async (opts) => {
        seen = opts.publicKey;
        return {
          response: {
            clientDataJSON: new Uint8Array([1, 2, 3]).buffer,
            attestationObject: new Uint8Array([4, 5, 6]).buffer,
            getTransports: () => ['internal'],
          },
        };
      },
      get: () => {},
    });

    const out = await register(regOptions());

    // In: base64 strings become buffers of the right length.
    expect(seen.challenge.byteLength).toBe(32);
    expect(seen.user.id.byteLength).toBe(16);
    expect(seen.excludeCredentials[0].id.byteLength).toBe(16);
    // ES256 must be offered: it is what real authenticators return, and what Playwright's
    // virtual one returns regardless of what is asked for.
    expect(seen.pubKeyCredParams.some((p) => p.alg === -7)).toBe(true);
    // Discoverable, or signing in would need an email and the endpoint would have to
    // become an account-existence oracle.
    expect(seen.authenticatorSelection.residentKey).toBe('preferred');

    // Out: buffers become base64, and the challenge is echoed unchanged.
    expect(out.clientDataJSON).toBe(bytesToBase64(new Uint8Array([1, 2, 3])));
    expect(out.attestationObject).toBe(bytesToBase64(new Uint8Array([4, 5, 6])));
    expect(out.challenge).toBe(regOptions().challenge);
    expect(out.transports).toEqual(['internal']);
  });

  it('returns null when the user cancels', async () => {
    stubCredentials({
      create: async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); },
      get: () => {},
    });

    await expect(register(regOptions())).resolves.toBeNull();
  });

  it('says something useful when the device is already enrolled', async () => {
    // InvalidStateError means excludeCredentials did its job. That is a friendly message,
    // not a failure.
    stubCredentials({
      create: async () => { throw Object.assign(new Error('no'), { name: 'InvalidStateError' }); },
      get: () => {},
    });

    await expect(register(regOptions())).rejects.toBeInstanceOf(PasskeyError);
  });
});

describe('authenticate', () => {
  it('encodes every field the server needs', async () => {
    stubCredentials({
      create: () => {},
      get: async () => ({
        rawId: new Uint8Array([9, 9]).buffer,
        response: {
          clientDataJSON: new Uint8Array([1]).buffer,
          authenticatorData: new Uint8Array([2]).buffer,
          signature: new Uint8Array([3]).buffer,
          userHandle: new Uint8Array([4]).buffer,
        },
      }),
    });

    const out = await authenticate(authOptions());

    expect(out.credentialID).toBe(bytesToBase64(new Uint8Array([9, 9])));
    expect(out.signature).toBe(bytesToBase64(new Uint8Array([3])));
    expect(out.userHandle).toBe(bytesToBase64(new Uint8Array([4])));
    expect(out.challenge).toBe(authOptions().challenge);
  });

  it('omits userHandle when the authenticator sent none', async () => {
    stubCredentials({
      create: () => {},
      get: async () => ({
        rawId: new Uint8Array([9]).buffer,
        response: {
          clientDataJSON: new Uint8Array([1]).buffer,
          authenticatorData: new Uint8Array([2]).buffer,
          signature: new Uint8Array([3]).buffer,
          userHandle: null,
        },
      }),
    });

    expect('userHandle' in (await authenticate(authOptions()))).toBe(false);
  });

  it('sends no allowCredentials, so the challenge stays usernameless', async () => {
    let seen = null;
    stubCredentials({
      create: () => {},
      get: async (opts) => {
        seen = opts.publicKey;
        return {
          rawId: new Uint8Array([1]).buffer,
          response: {
            clientDataJSON: new Uint8Array([1]).buffer,
            authenticatorData: new Uint8Array([1]).buffer,
            signature: new Uint8Array([1]).buffer,
            userHandle: null,
          },
        };
      },
    });

    await authenticate(authOptions());
    expect(seen.allowCredentials).toEqual([]);
  });

  it('returns null on cancellation and on an aborted conditional prompt', async () => {
    for (const name of ['NotAllowedError', 'AbortError']) {
      stubCredentials({
        create: () => {},
        get: async () => { throw Object.assign(new Error('no'), { name }); },
      });
      await expect(authenticate(authOptions())).resolves.toBeNull();
    }
  });

  it('raises for anything else', async () => {
    stubCredentials({
      create: () => {},
      get: async () => { throw Object.assign(new Error('boom'), { name: 'SecurityError' }); },
    });

    await expect(authenticate(authOptions())).rejects.toBeInstanceOf(PasskeyError);
  });
});
