/**
 * The two claims that need something to happen between two requests.
 *
 * `run.sh` runs `verify.mjs`, then backdates a reset token in SQL and restarts
 * the application, then runs this. Both halves are here because neither is
 * reachable from a driver on its own:
 *
 *   - **A session survives a restart.** This is the whole point of persisting
 *     the ticket signers, and it is invisible to any single-process test: the
 *     signers were in memory, so the previous behaviour was that a deploy signed
 *     out every user on the platform. If the stored private key is decrypted
 *     under the wrong id, or `ticket.globalSecret` is unset so persistence is
 *     refused, this is what says so.
 *
 *   - **An expired link answers 410 rather than 403.** `token.resetTTL` is
 *     configured in minutes, so backdating the row is the only way to reach the
 *     branch without waiting one out. The 403 case is checked alongside it,
 *     because the value of the distinction depends entirely on 410 being
 *     unreachable without a token that matches.
 *
 * Env: YASSS_API.
 */
import { readFileSync } from 'node:fs';

import { makeApi } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';
import { HANDLE } from './handle.mjs';

const api = makeApi();
const handle = JSON.parse(readFileSync(HANDLE, 'utf8'));

console.log('sessions (after restart)');

const survived = await api('GET', '/v1', { session: handle.session });
check(
  survived.account === handle.user,
  'a session ticket issued before the restart still authenticates',
  `got ${survived.account} -- the signing keys did not come back. Either they were `
    + 'not persisted (check that ticket.globalSecret is set to something real) or '
    + 'they were restored under the wrong id, which fails the GCM tag silently',
);
check(!!survived.session, 'and is rotated as usual');

// Backdated by run.sh between the two drivers.
const expired = await api('POST', `/v1/users/${handle.user}`, {
  body: { token: handle.resetToken, pubkey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' },
});
check(
  expired.status === 410,
  'a reset link past its deadline answers 410',
  `got ${expired.status}: ${JSON.stringify(expired.payload)}`,
);

const wrong = await api('POST', `/v1/users/${handle.user}`, {
  body: {
    token: '00000000-0000-0000-0000-000000000000',
    pubkey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  },
});
check(
  wrong.status === 403,
  'while a token that does not match stays a 403',
  `got ${wrong.status} -- if a wrong token could produce a 410 the status would `
    + 'answer "does this account have a reset outstanding", one guess at a time',
);

finish('sessions (after restart)');
