/**
 * WebAuthn, on the browser side.
 *
 * Two things this module exists to get right.
 *
 * **Encoding.** The ceremony moves binary in and out of the browser, and every field
 * crosses as base64. The WebAuthn API wants `ArrayBuffer` and hands back `ArrayBuffer`, so
 * every field is decoded on the way in and encoded on the way out. Getting the alphabet
 * wrong corrupts roughly one value in sixty-four — often enough to break real users,
 * rarely enough that nobody can reproduce it — and what it corrupts is a credential id.
 *
 * **Cancellation is not an error.** `navigator.credentials.get()` rejects with
 * `NotAllowedError` for user cancellation *and* for timeout, indistinguishably. Showing a
 * red toast because somebody pressed Escape is the single most common WebAuthn UX defect,
 * so that case returns `null` and the caller shows nothing at all.
 */
import { base64ToBytes, bytesToBase64 } from './base64.js';

/** Whether this browser can do WebAuthn at all. */
export function isSupported() {
  return typeof PublicKeyCredential !== 'undefined'
    && typeof navigator?.credentials?.create === 'function'
    && typeof navigator?.credentials?.get === 'function';
}

/**
 * Whether the device has a built-in authenticator (Touch ID, Windows Hello, a phone).
 *
 * Used only to decide how prominently to offer enrollment. It can reject rather than
 * resolve false on some browsers, hence the catch — a capability probe must never be the
 * thing that breaks a page.
 */
export async function hasPlatformAuthenticator() {
  if (!isSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

const toBuffer = (b64) => base64ToBytes(b64).buffer;
const fromBuffer = (buf) => bytesToBase64(new Uint8Array(buf));

/** Raised for a failure worth telling the user about. Cancellation does not use this. */
export class PasskeyError extends Error {}

/**
 * Enrolls a credential.
 *
 * @param {object} options as returned by `POST /v1/users/:user/passkeys/challenge`
 * @returns {Promise<object|null>} the fields to post back, or null if the user canceled
 */
export async function register(options) {
  let credential;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        challenge: toBuffer(options.challenge),
        rp: { id: options.rpID, name: options.rpName },
        user: {
          id: toBuffer(options.userHandle),
          name: options.userName,
          displayName: options.userName,
        },
        // ES256 first, then RS256. ES256 is what every authenticator in practice returns,
        // and it is what Playwright's virtual authenticator returns regardless of what is
        // asked for -- so omitting it would pass every test and fail nowhere useful.
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          // Discoverable, so that signing in needs no email. 'preferred' rather than
          // 'required' so a security key with no free slot can still enroll.
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        // Not verified server-side, so asking for it would cost a prompt on some platforms
        // and buy nothing. See PasskeyVerifier.
        attestation: 'none',
        // So re-presenting an already-enrolled authenticator fails cleanly with
        // InvalidStateError rather than silently creating a duplicate.
        excludeCredentials: (options.excludeCredentials ?? []).map((id) => ({
          type: 'public-key',
          id: toBuffer(id),
        })),
        timeout: 120_000,
      },
    });
  } catch (err) {
    if (err?.name === 'NotAllowedError') return null;
    if (err?.name === 'InvalidStateError') {
      throw new PasskeyError('That device already has a passkey for this account.');
    }
    throw new PasskeyError('Your device could not create a passkey.');
  }

  if (!credential) return null;

  return {
    challenge: options.challenge,
    clientDataJSON: fromBuffer(credential.response.clientDataJSON),
    attestationObject: fromBuffer(credential.response.attestationObject),
    transports: typeof credential.response.getTransports === 'function'
      ? credential.response.getTransports()
      : [],
  };
}

/**
 * Signs in.
 *
 * @param {object} options as returned by `POST /v1/passkeys/challenge`
 * @param {object} [extra]
 * @param {AbortSignal} [extra.signal] for conditional UI, so the modal can call it off
 * @returns {Promise<object|null>} the fields to post back, or null if canceled
 */
export async function authenticate(options, { signal, mediation } = {}) {
  let assertion;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge: toBuffer(options.challenge),
        rpId: options.rpID,
        // Deliberately empty: the server issues a usernameless challenge so that the
        // endpoint cannot become an oracle for which addresses are registered. The
        // authenticator offers whatever discoverable credentials it holds.
        allowCredentials: [],
        userVerification: 'preferred',
        timeout: 120_000,
      },
      ...(mediation ? { mediation } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    // AbortError is the conditional-UI path being called off deliberately; NotAllowedError
    // covers both cancellation and timeout and cannot be told apart. Neither is worth
    // showing anybody.
    if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return null;
    throw new PasskeyError('Your device could not use a passkey.');
  }

  if (!assertion) return null;

  return {
    challenge: options.challenge,
    credentialID: fromBuffer(assertion.rawId),
    clientDataJSON: fromBuffer(assertion.response.clientDataJSON),
    authenticatorData: fromBuffer(assertion.response.authenticatorData),
    signature: fromBuffer(assertion.response.signature),
    ...(assertion.response.userHandle
      ? { userHandle: fromBuffer(assertion.response.userHandle) }
      : {}),
  };
}
