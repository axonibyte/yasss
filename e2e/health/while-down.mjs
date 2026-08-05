/**
 * The readiness check with the database stopped.
 *
 * The only assertion that proves the point of the whole change, and it cannot
 * be made from inside a driver: `run.sh` stops the database container around
 * this script.
 *
 * Two things are being pinned. That the check goes red at all — it used to stay
 * green forever, because it never touched the database. And that it goes red
 * *promptly*: the connection pool's own timeout runs to tens of seconds and is
 * not configurable through `axb-lib-db`, so an unbounded probe would hang
 * rather than answer, which is worse for a supervisor than the lie it replaces.
 * A hung health check and a slow one are indistinguishable; a 503 is not.
 *
 * Env: YASSS_API.
 */
import { makeApi } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';

const api = makeApi();

console.log('readiness (database stopped)');

const began = Date.now();
let res;
try {
  res = await api('GET', '/v1');
} catch (e) {
  check(false, 'the endpoint answers rather than dropping the connection', String(e));
  finish('readiness (database stopped)');
}
const took = Date.now() - began;

check(
  res.status === 503,
  'an unreachable database is a 503',
  `got ${res.status}: ${JSON.stringify(res.payload)} -- a 200 here is the whole `
    + 'defect: green while every real endpoint is broken',
);

check(
  res.payload?.status !== 'ok',
  'and the envelope does not claim ok',
  JSON.stringify(res.payload),
);

// The probe's own deadline is two seconds; allow generously for a loaded
// container while still failing if it fell through to the pool's timeout, which
// is an order of magnitude longer.
check(
  took < 10_000,
  'and it answers promptly rather than hanging on the pool timeout',
  `took ${took}ms`,
);

finish('readiness (database stopped)');
