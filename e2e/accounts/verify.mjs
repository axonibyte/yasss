/**
 * End-to-end verification of self-service registration against the real stack.
 *
 * This is the platform's front door and nothing exercised it whole before.
 * Registering, receiving the email, clicking the link and then actually being
 * able to do something spans a mail send, a stored token and an access-level
 * promotion, and two separate bugs lived in that gap:
 *
 *   - the verification link was signed by the TicketEngine, whose signers roll
 *     on a ~15-minute horizon and are lost on restart, so the email was dead
 *     long before most people opened it; and
 *   - verifying populated the `email` column but never promoted the access
 *     level, so a user who had verified could suddenly log in yet still got a
 *     403 from every endpoint gated on STANDARD. Self-registered accounts could
 *     never create an event without an ADMIN promoting them by hand.
 *
 * Neither is visible from inside the API alone: each step answers 200.
 *
 * Env: YASSS_API, YASSS_MAILPIT.
 */
import { genCreds } from '../../frontend/src/lib/crypto/creds.js';
import { makeApi } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';
import { messageBody, waitForMail as waitForMessage } from '../lib/mailpit.mjs';

const api = makeApi();

/** Polls mailpit for a message to `address` and returns its body. */
async function waitForMail(address, timeoutMs = 20_000) {
  const found = await waitForMessage(address, { timeoutMs });
  // The links in these bodies are compared and followed rather than parsed, so
  // the entity-encoded separators come out here rather than at each use.
  return found ? (await messageBody(found.ID)).replace(/&amp;/g, '&') : null;
}

const EMAIL = `signup-${Date.now()}@example.com`;
const PASSWORD = 'a-perfectly-ordinary-password';

console.log('self-service registration');

// The key is derived by the application's own module, so it is byte-identical
// to what a browser produces for the same password.
const { pubkey, payload } = await genCreds(EMAIL, PASSWORD);

const created = await api('POST', '/v1/users', {
  body: { email: EMAIL, pubkey, generateMFA: false },
});
check(created.status === 201, 'registration succeeds', `got ${created.status}`);

const userId = created.payload?.user?.id;
check(
  created.payload?.user?.accessLevel === 'UNVERIFIED',
  'a new account starts UNVERIFIED',
  `got ${created.payload?.user?.accessLevel}`,
);

// Before verifying, the address is only pending, so authentication cannot even
// resolve the account -- which is why an "unverified user sees 403s" banner
// would have had nowhere to appear.
const preAuth = await api('GET', '/v1', { auth: payload });
check(!preAuth.account, 'an unverified account cannot authenticate at all');

const mail = await waitForMail(EMAIL);
check(mail !== null, 'a welcome email arrives');

let link = null;
if (mail) {
  const m = mail.match(/action=verify-user[^"'\s<>]*/);
  link = m ? Object.fromEntries(new URLSearchParams(m[0])) : null;
  check(link !== null, 'the welcome email carries a verification link');
  check(!mail.includes('[['), 'no template placeholder is left unsubstituted');
}

if (link) {
  check(link.user === userId, 'the link names the account it was sent for');

  const verified = await api('PUT', `/v1/users/${link.user}`, { body: { token: link.token } });
  check(verified.status === 200, 'the verification link is accepted', `got ${verified.status}`);

  // Replaying it must not work: the token is cleared on use.
  const replay = await api('PUT', `/v1/users/${link.user}`, { body: { token: link.token } });
  check(replay.status === 403, 'the link is single-use', `got ${replay.status}`);

  const postAuth = await api('GET', '/v1', { auth: payload });
  check(!!postAuth.account, 'the account can authenticate once verified');
  check(
    postAuth.accessLevel === 'STANDARD',
    'verifying promotes the account to STANDARD',
    `got ${postAuth.accessLevel} -- verification that does not promote leaves the user `
      + 'able to log in but refused by every endpoint that matters',
  );

  // The proof that promotion is real rather than cosmetic: an authenticated
  // caller below STANDARD is refused here, where an anonymous one would pass.
  const event = await api('POST', '/v1/events', {
    auth: payload,
    body: {
      shortDescription: 'First Event',
      longDescription: '',
      details: [],
      windows: [{ beginTime: String(Date.now() + 86_400_000), endTime: String(Date.now() + 90_000_000) }],
      activities: [{ shortDescription: 'Setup', slots: [{ enabled: true, window: 0 }] }],
    },
  });
  check(
    event.status === 201,
    'a freshly verified user can create an event',
    `got ${event.status}: ${JSON.stringify(event.payload)}`,
  );
}

// A wrong token must be refused, and a malformed one must not be a 500.
const wrong = await api('PUT', `/v1/users/${userId}`, {
  body: { token: '00000000-0000-0000-0000-000000000000' },
});
check(wrong.status === 403, 'a wrong token is refused', `got ${wrong.status}`);

const malformed = await api('PUT', `/v1/users/${userId}`, { body: { token: 'not-a-uuid' } });
check(malformed.status === 403, 'a malformed token is a 403, not a 500', `got ${malformed.status}`);

finish('accounts');
