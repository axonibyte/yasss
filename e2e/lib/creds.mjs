/**
 * Authenticating a driver against the API.
 *
 * There is no sign-in endpoint. A password credential is a signed blob derived from the
 * email and password, so a driver signs in by deriving the same blob the browser would
 * and presenting it to `GET /v1` -- which answers with a session ticket.
 *
 * **A credential is only accepted at `GET /v1`.** Everywhere else needs the ticket. That
 * is deliberate: a credential deliberately escapes `session_epoch`, so that a
 * platform-wide revoke forces a re-login rather than locking everybody out for good, and
 * the price of that exemption is that a captured credential header is a bearer token no
 * revocation can withdraw. Confining it to the sign-in route means a captured header buys
 * a session rather than unrestricted access for the life of the password.
 *
 * So {@link adminAuth} and {@link authFor} return **tickets**, not credentials, and a
 * driver should pass what they return to every request. If you need the credential itself
 * -- to test the sign-in route, or to prove it is refused elsewhere -- use
 * {@link credentialFor}.
 *
 * The derivation is real scrypt at N=16384, which costs a second or two, so the derived
 * key and the resulting ticket are memoised per account for the life of the process. The
 * **credential itself is not**, and must not be: since v2 it carries a timestamp and a
 * single-use nonce, so a cached one is a replay and the server refuses it. This file
 * previously memoised the payload and said so in its own comments -- that was correct
 * when the signature was static and is now exactly backwards.
 *
 * `genCreds` is imported straight out of the application's own source. That is the point:
 * if the client's derivation and the server's expectation ever drift apart, these drivers
 * stop authenticating, which is a louder failure than a reimplementation quietly agreeing
 * with itself. Node resolves its dependencies out of frontend/node_modules relative to
 * that file, so the importing driver's working directory does not matter.
 */
import { deriveKey, genCreds } from '../../frontend/src/lib/crypto/creds.js';
import { signRequest } from '../../frontend/src/lib/crypto/sigreq2.js';
import { makeApi } from './api.mjs';

const api = makeApi();

const credentials = new Map();
const tickets = new Map();

// Written as an escape. A literal NUL makes this file binary to git and invisible to
// grep, which is how it went unnoticed here for as long as it did.
const key = (email, password) => `${email}\0${password}`;

let audience = null;

/** The audience a v2 credential must name, as the server publishes it. */
async function sigAudience() {
  if (null === audience) {
    const info = await api('GET', '/v1');
    audience = info.payload?.info?.sigAudience ?? info.payload?.sigAudience ?? null;
    if (!audience) throw new Error('server published no sigAudience; cannot sign a v2 credential');
  }
  return audience;
}

/**
 * A freshly signed `Authorization` credential for an account.
 *
 * **Minted per call, never cached.** A v2 credential carries a timestamp and a single-use
 * nonce, so reusing one is precisely what the server now refuses — and a harness that
 * cached it would be asserting that replay works. Only the scrypt is memoised, which is
 * where the second-or-two goes.
 *
 * Only `GET /v1` accepts one of these at all. Use {@link authFor} for anything else.
 */
export async function credentialFor(email, password) {
  const k = key(email, password);
  if (!credentials.has(k)) credentials.set(k, deriveKey(password));
  return signRequest(await credentials.get(k), { aud: await sigAudience(), email });
}

/**
 * A credential in the original replayable format, for tests about the legacy path.
 */
export async function legacyCredentialFor(email, password) {
  return (await genCreds(email, password)).payload;
}

/**
 * A session ticket for an account, signing in once to obtain it.
 *
 * This is what a driver wants for essentially every request.
 */
export async function authFor(email, password) {
  const k = key(email, password);
  if (!tickets.has(k)) {
    tickets.set(k, (async () => {
      const payload = await credentialFor(email, password);
      const res = await api('GET', '/v1', { auth: payload });
      if (!res.session) {
        throw new Error(
          `could not sign in as ${email}: no session ticket returned `
          + `(status ${res.status}, account ${res.account})`,
        );
      }
      return res.session;
    })());
  }
  return tickets.get(k);
}

/**
 * A session ticket for the bootstrap administrator that `run.sh` registers before any
 * stage runs.
 */
export async function adminAuth() {
  return authFor(...adminIdentity());
}

/**
 * The raw credential for the bootstrap administrator, for tests about sign-in itself.
 */
export async function adminCredential() {
  return credentialFor(...adminIdentity());
}

function adminIdentity() {
  const email = process.env.YASSS_ADMIN_EMAIL;
  const password = process.env.YASSS_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'YASSS_ADMIN_EMAIL/YASSS_ADMIN_PASSWORD are unset; run this through e2e/run.sh',
    );
  }
  return [email, password];
}
