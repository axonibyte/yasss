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

// `version` is the API version and stays an ordinal; `build` is the artefact.
// Worth pinning that they are two different things, because they were conflated
// and the answer to "what is running" was 0.
check(
  res.payload?.version !== res.payload?.build,
  'the API version and the build version are separate fields',
  `version=${JSON.stringify(res.payload?.version)} build=${JSON.stringify(res.payload?.build)}`,
);

finish('readiness');
