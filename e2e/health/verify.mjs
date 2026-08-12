/**
 * What the readiness check actually checks.
 *
 * `GET /v1` is what a supervisor polls and what this very script waits on
 * before it believes the stack is up. It used to read nothing but in-memory
 * state — uptime, a couple of config flags — so it answered `{"status":"ok"}`
 * with a dead database while every endpoint that mattered returned `database
 * malfunction`. "Ready" meant "the process is up", which is the one thing a
 * supervisor already knows without asking.
 *
 * This half runs against a healthy stack. `run.sh` stops the database and runs
 * `while-down.mjs` for the half that cannot be checked from here.
 *
 * Env: YASSS_API.
 */
import { makeApi } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';

const api = makeApi();

console.log('readiness');

const res = await api('GET', '/v1');

check(res.status === 200, 'a healthy stack answers 200', `got ${res.status}`);
check(res.payload?.status === 'ok', 'and says ok', JSON.stringify(res.payload));

// --- which build is running --------------------------------------------------

check(
  typeof res.payload?.build === 'string' && res.payload.build.length > 0,
  'the response says which build it is',
  `got ${JSON.stringify(res.payload?.build)}`,
);

check(
  res.payload?.build !== '(dev)',
  'and it is a real version rather than the run-from-classes placeholder',
  `got ${JSON.stringify(res.payload?.build)} -- the jar manifest lost its `
    + 'Implementation-Version, so nothing on a running system knows which build it is',
);

// `version` is the API version and stays an ordinal; `build` is the artifact.
// Worth pinning that they are two different things, because they were conflated
// and the answer to "what is running" was 0.
check(
  res.payload?.version !== res.payload?.build,
  'the API version and the build version are separate fields',
  `version=${JSON.stringify(res.payload?.version)} build=${JSON.stringify(res.payload?.build)}`,
);

// A relying party that cannot be resolved disables passkeys with an error and lets
// everything else carry on -- correct behavior, and exactly the kind of thing that goes
// unnoticed. Asserted positively rather than by grepping the boot log for the absence of
// an error, which would also hold if the server had never started.
//
// Nothing else in this suite can catch it: an RP ID may not be an IP address, the shipped
// api.host is one, and Playwright's virtual authenticator does not enforce the rule -- so
// the browser tier would pass green against a configuration no real browser accepts.
check(
  res.payload?.passkeys === true,
  'the relying party resolved, so passkeys are actually available',
  `got ${JSON.stringify(res.payload?.passkeys)} -- api.host must be a hostname, not an IP `
    + 'literal; see RelyingPartyConfig',
);

// The audience a v2 credential must name. Published for the client to sign against, and
// pinned here because a client that cannot read it falls back to the replayable format.
check(
  typeof res.payload?.sigAudience === 'string' && res.payload.sigAudience.length > 0,
  'and the credential audience is published',
  `got ${JSON.stringify(res.payload?.sigAudience)}`,
);

finish('readiness');
