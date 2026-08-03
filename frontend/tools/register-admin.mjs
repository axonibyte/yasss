/**
 * Register the bootstrap administrator on a fresh stack.
 *
 * `CreateUserEndpoint` grants ADMIN to the very first account on an empty
 * installation and UNVERIFIED to everyone after it. Escaping UNVERIFIED needs a
 * token that is only ever emailed, and email is disabled in the e2e
 * environment — while `CreateEventEndpoint` requires at least STANDARD for an
 * *authenticated* caller, so an UNVERIFIED account gets a 403 where an
 * anonymous one succeeds. There is no route back. Hence: claim the first slot,
 * before anything else can.
 *
 * The public key comes from the application's own module. `creds.js` is plain
 * ESM with no DOM dependency, so the key registered here is byte-identical to
 * the one the browser derives when it logs in with the same password. Deriving
 * it any other way would be testing the test.
 *
 * Prints the account id on stdout; diagnostics go to stderr.
 */
import { genCreds } from '../src/lib/crypto/creds.js';

const API = process.env.YASSS_API ?? 'http://127.0.0.1:7455';
const EMAIL = process.env.YASSS_ADMIN_EMAIL ?? 'e2e-admin@example.com';
const PASSWORD = process.env.YASSS_ADMIN_PASSWORD ?? 'e2e-admin-password';

const die = (message) => { console.error(`  ${message}`); process.exit(1); };

const { pubkey, payload } = await genCreds(EMAIL, PASSWORD);

const res = await fetch(`${API}/v1/users`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, pubkey, generateMFA: false }),
});
const body = await res.json().catch(() => null);

if (res.status === 409) {
  // A --keep'd stack being re-run already has the account. Recover the id by
  // authenticating, which also proves the stored key still matches the password
  // about to be handed to Playwright.
  const auth = await fetch(`${API}/v1`, {
    headers: { Authorization: `AXB-SIG-REQ ${payload}` },
  });
  const account = auth.headers.get('axb-account');
  if (!account) {
    die(`${EMAIL} already exists but its credentials no longer authenticate; `
      + 'the database is in an unexpected state');
  }
  console.error(`  reusing existing administrator ${account}`);
  console.log(account);
  process.exit(0);
}

if (!res.ok || body?.status !== 'ok') {
  die(`registration failed (${res.status}): ${body?.info ?? 'no response body'}`);
}

// Not a flake if this trips: it means the database was not empty, so this
// account is UNVERIFIED and the whole authenticated half of the suite is about
// to fail in a way that points nowhere near the cause.
if (body.user?.accessLevel !== 'ADMIN') {
  die(`expected the first account to be ADMIN, got ${body.user?.accessLevel}. `
    + 'Something registered before this did -- the fuzz stage, most likely.');
}

console.log(body.user.id);
