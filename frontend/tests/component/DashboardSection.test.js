/**
 * Dashboard loading — and the request loop it used to cause.
 *
 * `$effect` tracks every reactive read made synchronously in its body. The
 * effect here calls `api.listEvents`, and `request()` reads the session token
 * before its first `await` — so the token was a dependency of the effect. Since
 * the server issues a fresh token on every authenticated response, absorbing
 * that response wrote the dependency the effect was tracking, which re-ran the
 * effect, which issued two more requests. Observed against the dev server at
 * ~140 req/s, sustained until the tab was closed, with client memory climbing
 * the whole time.
 *
 * The fix is in the auth bridge rather than here: a token rotation must never
 * invalidate view state, and the three effects that call the API today would
 * otherwise each have to remember to untrack.
 */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import { render } from '@testing-library/svelte';
import Cookies from 'js-cookie';
import DashboardSection from '../../src/components/sections/DashboardSection.svelte';
import { session, connectSessionToApi } from '../../src/state/session.svelte.js';
import { resetAuthBridge } from '../../src/lib/api/authBridge.js';

/** A response carrying `headers`, shaped like the ones the client parses. */
function reply(headers) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    json: () => Promise.resolve({ status: 'ok', events: [] }),
  };
}

/**
 * Enough requests to prove a runaway, few enough to fail as an assertion.
 * Left unbounded, a regression here does to this worker exactly what it does to
 * a browser tab — runs it out of memory — and an OOM reports as a dead worker
 * rather than as the count that would tell you what broke.
 */
const RUNAWAY_CAP = 50;

let fetchMock;
let issued;

beforeEach(() => {
  Cookies.remove('user', { path: '/' });
  session.clear();
  resetAuthBridge();
  issued = 0;
  fetchMock = vi.fn(() => {
    issued += 1;
    // Past the cap, stop rotating; with nothing writing the token the loop
    // settles and the assertion gets to speak.
    const headers = issued > RUNAWAY_CAP ? {} : { 'axb-session': `tok-${issued}` };
    return Promise.resolve(reply(headers));
  });
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  session.clear();
  resetAuthBridge();
});

/** Let effects, their requests, and any resulting invalidation fully settle. */
async function settle(turns = 12) {
  for (let i = 0; i < turns; i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
}

describe('DashboardSection', () => {
  it('requests each list exactly once, though every response rotates the token', async () => {
    session.account = 'acct-1';
    session.token = 'tok-0';
    connectSessionToApi();

    render(DashboardSection, { props: { onSelect: () => {} } });
    await settle();

    // Two: the owned list and the RSVP'd list. Before the fix this ran away.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Without this the test would pass just as well against a client that had
    // stopped absorbing rotations at all, which is a different defect.
    expect(session.token).not.toBe('tok-0');
  });

  it('asks for the owned and the RSVP\'d lists, scoped to the account', async () => {
    session.account = 'acct-1';
    session.token = 'tok-0';
    connectSessionToApi();

    render(DashboardSection, { props: { onSelect: () => {} } });
    await settle();

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.some((u) => u.includes('admin=acct-1'))).toBe(true);
    expect(urls.some((u) => u.includes('volunteer=acct-1'))).toBe(true);
  });

  it('issues nothing at all while signed out', async () => {
    render(DashboardSection, { props: { onSelect: () => {} } });
    await settle(4);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
