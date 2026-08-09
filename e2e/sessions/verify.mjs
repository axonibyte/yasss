/**
 * End-to-end verification of session lifetime and revocation.
 *
 * Sessions used to be a signature and nothing else: the ticket carried an
 * account id, the signers lived in memory, and there was no way at all to end a
 * session from the server. Concretely, that meant a password change left whoever
 * had the old one signed in, a ban left the banned party's session working, and
 * every deploy signed out the entire user base.
 *
 * None of that is visible from a single request -- each one answers 200. It
 * takes two sessions and a revocation between them, which is what this does.
 *
 * The other half of the story lives in `after-restart.mjs`: this driver leaves
 * behind a live ticket and a reset token, and `run.sh` restarts the application
 * and ages the token before that one checks them. Splitting it that way is what
 * makes "a session survives a deploy" and "an expired link answers 410"
 * testable without waiting an hour.
 *
 * Env: YASSS_API, YASSS_MAILPIT, YASSS_ADMIN_EMAIL, YASSS_ADMIN_PASSWORD.
 */
import { writeFileSync } from 'node:fs';

import { genCreds } from '../../frontend/src/lib/crypto/creds.js';
import { makeApi } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';
import { adminAuth, credentialFor } from '../lib/creds.mjs';
import { deriveKey } from '../../frontend/src/lib/crypto/creds.js';
import { signRequest } from '../../frontend/src/lib/crypto/sigreq2.js';
import { sleep } from '../lib/check.mjs';
import { inbox, linkParams, messageBody } from '../lib/mailpit.mjs';
import { HANDLE } from './handle.mjs';

const api = makeApi();

/**
 * Polls for a link of a given action in a message to an address.
 *
 * Waiting for "any message to this address" is not enough here. Alice receives
 * three emails over the course of this driver -- a welcome and two resets -- and
 * mailpit answers newest first, so a poll that fires before the one being waited
 * for has landed happily returns the previous one. `not` is what makes the
 * second reset distinguishable from the first: without it the driver would hand
 * `after-restart.mjs` an already-consumed token and the 410 check would fail as
 * a 403, intermittently.
 */
async function waitForLink(address, action, { not = null, timeoutMs = 20_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const m of await inbox()) {
      if (!m.To?.some((t) => t.Address === address)) continue;
      const link = linkParams(await messageBody(m.ID), action);
      if (link && link.token !== not) return link;
    }
    await sleep(1000);
  }
  return null;
}

/**
 * Registers an account, follows its verification link, and returns it signed in.
 *
 * Self-registration rather than the bootstrap administrator, because most of
 * what follows is about a STANDARD user and an ADMIN is exempt from some of it.
 */
async function newUser(label, password) {
  const email = `${label}-${Date.now()}@example.com`;
  const { pubkey } = await genCreds(email, password);

  const created = await api('POST', '/v1/users', {
    body: { email, pubkey, generateMFA: false },
  });
  if (created.status !== 201) throw new Error(`could not register ${label}: ${created.status}`);

  const link = await waitForLink(email, 'verify-user');
  if (!link) throw new Error(`no verification link for ${label}`);

  const verified = await api('PUT', `/v1/users/${link.user}`, { body: { token: link.token } });
  if (verified.status !== 200) throw new Error(`could not verify ${label}: ${verified.status}`);

  // A function, not a value. A v2 credential is single-use, so handing back one blob to
  // be reused would make every second sign-in a replay -- which is exactly what the
  // server now refuses.
  return {
    email,
    password,
    id: created.payload?.user?.id,
    credential: () => credentialFor(email, password),
  };
}

/** A correctly signed credential stamped well outside the skew window. */
async function staleCredential(email, password) {
  const privkey = await deriveKey(password);
  const info = await api('GET', '/v1');
  return signRequest(privkey, {
    aud: info.payload?.info?.sigAudience ?? info.payload?.sigAudience,
    email,
    now: Date.now() - 60 * 60 * 1000,
  });
}

const PASSWORD = 'a-perfectly-ordinary-password';

console.log('sessions');

const alice = await newUser('alice', PASSWORD);

// --- a ticket is a credential in its own right -------------------------------

const first = await api('GET', '/v1', { auth: await alice.credential() });
check(!!first.session, 'authenticating issues a session ticket');

const bySession = await api('GET', '/v1', { session: first.session });
check(
  bySession.account === alice.id,
  'the ticket authenticates on its own, with no password',
  `got ${bySession.account}`,
);
check(
  !!bySession.session && bySession.session !== first.session,
  'and is rotated on every response',
);

// --- signing out everywhere --------------------------------------------------

// Two independent sign-ins: two devices, in the sense that matters here.
// Two separate sign-ins, each with its own credential. This used to present one blob
// twice, which was fine when a credential was static and is now precisely a replay --
// the check would have started asserting that replay works.
const deviceA = (await api('GET', '/v1', { auth: await alice.credential() })).session;
const deviceB = (await api('GET', '/v1', { auth: await alice.credential() })).session;
check(!!deviceA && !!deviceB && deviceA !== deviceB, 'two sign-ins yield two tickets');

const revoked = await api('DELETE', `/v1/users/${alice.id}/sessions`, { session: deviceA });
check(revoked.status === 200, 'a user can sign their sessions out', `got ${revoked.status}`);

const afterRevoke = await api('GET', '/v1', { session: deviceB });
check(
  !afterRevoke.account,
  'the other device is signed out immediately',
  'a revocation that takes effect on the next rotation rather than the next '
    + 'request is not a revocation',
);

check(
  !!revoked.session,
  'and the device that asked is handed a replacement ticket',
  'signing out everywhere including the browser you clicked it in is '
    + 'indistinguishable from a bug',
);
const stillHere = await api('GET', '/v1', { session: revoked.session });
check(stillHere.account === alice.id, 'which still works', `got ${stillHere.account}`);

// A third party cannot end somebody else's sessions.
const bob = await newUser('bob', PASSWORD);
// Bob signs in and acts with the resulting ticket. Presenting his credential directly
// would now be refused for a different reason than the one under test, and the check
// would pass while proving nothing about authorization.
const bobTicket = (await api('GET', '/v1', { auth: await bob.credential() })).session;
const meddling = await api('DELETE', `/v1/users/${alice.id}/sessions`, { session: bobTicket });
check(meddling.status === 403, "a stranger cannot revoke another account's sessions",
  `got ${meddling.status}`);

// --- a credential reset ends every session -----------------------------------

const living = (await api('GET', '/v1', { auth: await alice.credential() })).session;
check(!!living, 'alice has a live session before the reset');

const requested = await api('POST', `/v1/users/${alice.id}`, {});
check(requested.status === 202, 'a reset can be requested', `got ${requested.status}`);

const resetLink = await waitForLink(alice.email, 'reset-user');
check(resetLink !== null, 'the reset email carries a link');
check(
  resetLink?.token && /^[0-9a-f-]{36}$/i.test(resetLink.token),
  'whose token is a stored UUID rather than a TicketEngine signature',
  `got ${resetLink?.token} -- a signed token dies with the signer that made it, `
    + 'which is why reset links used to stop working after fifteen minutes',
);

const NEW_PASSWORD = 'an-entirely-different-password';
const fresh = await genCreds(alice.email, NEW_PASSWORD);

const consumed = await api('POST', `/v1/users/${alice.id}`, {
  body: { token: resetLink.token, pubkey: fresh.pubkey },
});
check(consumed.status === 200, 'the reset link is accepted', `got ${consumed.status}`);

const replay = await api('POST', `/v1/users/${alice.id}`, {
  body: { token: resetLink.token, pubkey: fresh.pubkey },
});
check(replay.status === 403, 'and is single-use', `got ${replay.status}`);

const afterReset = await api('GET', '/v1', { session: living });
check(
  !afterReset.account,
  'a credential reset ends the sessions established under the old one',
  'otherwise changing the password of an account you believe is compromised '
    + 'leaves whoever compromised it signed in',
);

const withNew = await api('GET', '/v1', {
  auth: await credentialFor(alice.email, NEW_PASSWORD),
});
check(withNew.account === alice.id, 'and the new credential signs in', `got ${withNew.account}`);

// --- a credential is only good for signing in --------------------------------

// A password credential deliberately escapes session_epoch, so that a platform-wide
// revoke forces a re-login rather than locking everybody out for good. The cost is that a
// captured credential header is a bearer token no revocation can withdraw -- and for an
// account with no MFA the signed message never changes, so capturing it once is enough.
// Confining it to the sign-in route does not fix that, but it does mean a captured header
// buys a session ticket rather than unrestricted access for the life of the password.
const credentialElsewhere = await api('GET', `/v1/users/${bob.id}`, { auth: await bob.credential() });
check(!credentialElsewhere.account, 'a password credential is refused outside sign-in',
  `got account ${credentialElsewhere.account}`);

const credentialAtSignIn = await api('GET', '/v1', { auth: await bob.credential() });
check(credentialAtSignIn.account === bob.id, 'while sign-in still accepts one',
  `got ${credentialAtSignIn.account}`);

// --- a credential is single-use and expires ----------------------------------

// What v2 buys over the sign-in-route restriction alone. A captured credential is now
// good for one use inside a five-minute window, rather than forever.
const once = await bob.credential();
const firstUse = await api('GET', '/v1', { auth: once });
check(firstUse.account === bob.id, 'a fresh credential signs in', `got ${firstUse.account}`);

const replayed = await api('GET', '/v1', { auth: once });
check(!replayed.account, 'and the same credential cannot be presented twice');

// The claim happens only after the signature verifies, so a refused replay must not have
// spent anything the legitimate holder still needs. Without this, an attacker who
// observed a credential in flight could burn its nonce before the real request landed.
const afterReplay = await api('GET', '/v1', { auth: await bob.credential() });
check(afterReplay.account === bob.id, 'and the account is not poisoned by the replay',
  `got ${afterReplay.account}`);

// A credential dated outside the window, signed correctly. Refused on its timestamp
// alone, which is decided before any account is looked up -- hence the hint being safe to
// return, and hence a client with a wrong clock getting something actionable instead of
// "invalid credentials".
const stale = await staleCredential(bob.email, bob.password);
const staleRes = await api('GET', '/v1', { auth: stale });
check(!staleRes.account, 'a credential outside the skew window is refused');
check(staleRes.authHint === 'CLOCK_SKEW', 'and says so, so a wrong clock is diagnosable',
  `got ${staleRes.authHint}`);
check(!!staleRes.serverTime, 'and hands back the server clock to correct against');

// --- the platform-wide lever -------------------------------------------------

const admin = await adminAuth();

const bobSession = (await api('GET', '/v1', { auth: await bob.credential() })).session;

const notAdmin = await api('DELETE', '/v1/sessions', { session: bobSession });
check(notAdmin.status === 403, 'a standard user cannot revoke the platform',
  `got ${notAdmin.status}`);
const nuked = await api('DELETE', '/v1/sessions', { auth: admin });
check(nuked.status === 200, 'an administrator can revoke every session', `got ${nuked.status}`);

const bobAfter = await api('GET', '/v1', { session: bobSession });
check(!bobAfter.account, "and an unrelated account's session dies with it");

check(!!nuked.session, 'the administrator is handed a working replacement');
const adminAfter = await api('GET', '/v1', { session: nuked.session });
check(
  !!adminAfter.account,
  'which authenticates',
  `got ${adminAfter.account} -- an administrator who cannot reach the next endpoint `
    + 'after pulling this lever cannot tell whether it worked',
);

// --- hand off to after-restart.mjs -------------------------------------------

// Captured last, after the platform revoke, so the ticket under test was signed
// by a signer minted after the wipe. Anything earlier would prove nothing.
const surviving = (await api('GET', '/v1', {
  auth: await credentialFor(alice.email, NEW_PASSWORD),
})).session;
check(!!surviving, 'a ticket is available to carry across the restart');

const pending = await api('POST', `/v1/users/${alice.id}`, {});
check(pending.status === 202, 'a second reset can be requested', `got ${pending.status}`);
const pendingLink = await waitForLink(alice.email, 'reset-user', { not: resetLink?.token });

writeFileSync(
  HANDLE,
  JSON.stringify({ user: alice.id, session: surviving, resetToken: pendingLink?.token }, null, 2),
);
check(
  !!pendingLink?.token,
  'and a reset token is available to age',
  'run.sh backdates it in SQL, which is the only way to reach the 410 branch '
    + 'without waiting out token.resetTTL',
);

finish('sessions');
