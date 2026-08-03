/**
 * Session state.
 *
 * Worth unit testing rather than leaving to the browser: it is pure logic over
 * a cookie and an injectable API, and several of its failure modes are awkward
 * to provoke through a UI — a malformed cookie, a rotation arriving mid-flight,
 * a server that stops recognising a token.
 *
 * The rotation behaviour in particular carries a legacy defect: the old client
 * advanced its in-memory token but only wrote it back to the cookie inside the
 * refresh timer, so reloading between rotations logged the user out.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Cookies from 'js-cookie';

vi.mock('../../src/lib/api/index.js', () => ({
  getApiInfo: vi.fn(),
  listEvents: vi.fn(),
}));

const api = await import('../../src/lib/api/index.js');
const { session, connectSessionToApi } = await import('../../src/state/session.svelte.js');
const { getToken, notifyRotate, resetAuthBridge } = await import('../../src/lib/api/authBridge.js');

const readCookie = () => {
  const raw = Cookies.get('user');
  return raw ? JSON.parse(raw) : null;
};

beforeEach(() => {
  Cookies.remove('user', { path: '/' });
  session.clear();
  resetAuthBridge();
  vi.clearAllMocks();
  api.listEvents.mockResolvedValue({ events: [] });
});

describe('login', () => {
  it('stores the account, token and level, and persists them', async () => {
    api.getApiInfo.mockResolvedValue({
      _auth: { account: 'acct-1', session: 'tok-1', accessLevel: 'STANDARD' },
    });

    await session.login('ada@example.com', 'hunter2');

    expect(session.loggedIn).toBe(true);
    expect(session.account).toBe('acct-1');
    expect(session.accessLevel).toBe('STANDARD');
    expect(readCookie()).toMatchObject({ account: 'acct-1', session: 'tok-1' });
  });

  it('throws, and stays anonymous, when the server returns no account', async () => {
    api.getApiInfo.mockResolvedValue({ _auth: { account: null, session: null } });

    await expect(session.login('nobody@example.com', 'pw')).rejects.toThrow();
    // Half-committing here would leave a logged-in-looking UI with no session.
    expect(session.loggedIn).toBe(false);
    expect(readCookie()).toBeNull();
  });

  it('loads the events this account owns', async () => {
    api.getApiInfo.mockResolvedValue({
      _auth: { account: 'acct-1', session: 'tok-1', accessLevel: 'STANDARD' },
    });
    api.listEvents.mockResolvedValue({ events: [{ id: 'e1' }, { id: 'e2' }] });

    await session.login('ada@example.com', 'pw');

    expect(session.owns('e1')).toBe(true);
    expect(session.owns('nope')).toBe(false);
  });
});

describe('rotation', () => {
  beforeEach(async () => {
    api.getApiInfo.mockResolvedValue({
      _auth: { account: 'acct-1', session: 'tok-1', accessLevel: 'STANDARD' },
    });
    await session.login('ada@example.com', 'pw');
  });

  it('persists a rotated token immediately', () => {
    session.rotate('tok-2');

    expect(session.token).toBe('tok-2');
    // The cookie, not just memory — this is the legacy defect.
    expect(readCookie().session).toBe('tok-2');
  });

  it('ignores a token identical to the one already held', () => {
    const before = readCookie();
    session.rotate('tok-1');
    expect(readCookie()).toEqual(before);
  });

  it('ignores an empty rotation', () => {
    session.rotate(null);
    expect(session.token).toBe('tok-1');
  });
});

describe('refresh', () => {
  it('is false for an anonymous session, without calling the server', async () => {
    expect(await session.refresh()).toBe(false);
    expect(api.getApiInfo).not.toHaveBeenCalled();
  });

  it('keeps a session the server still recognises', async () => {
    api.getApiInfo.mockResolvedValue({
      _auth: { account: 'acct-1', session: 'tok-1', accessLevel: 'STANDARD' },
    });
    await session.login('ada@example.com', 'pw');

    expect(await session.refresh()).toBe(true);
    expect(session.loggedIn).toBe(true);
  });

  it('clears a session the server no longer recognises', async () => {
    api.getApiInfo.mockResolvedValue({
      _auth: { account: 'acct-1', session: 'tok-1', accessLevel: 'STANDARD' },
    });
    await session.login('ada@example.com', 'pw');

    // An authenticating endpoint that returns no account is the one signal that
    // definitively means "this token is dead".
    api.getApiInfo.mockResolvedValue({ _auth: { account: null } });

    expect(await session.refresh()).toBe(false);
    expect(session.loggedIn).toBe(false);
    expect(readCookie()).toBeNull();
  });

  it('keeps the session when the request fails outright', async () => {
    api.getApiInfo.mockResolvedValue({
      _auth: { account: 'acct-1', session: 'tok-1', accessLevel: 'STANDARD' },
    });
    await session.login('ada@example.com', 'pw');

    // A network failure is not proof of anything; discarding a good session
    // because the wifi dropped would be its own bug.
    api.getApiInfo.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await session.refresh()).toBe(false);
    expect(session.loggedIn).toBe(true);
  });

  it('notifies the app when a session is genuinely lost', async () => {
    const onSessionLost = vi.fn();
    connectSessionToApi({ onSessionLost });

    api.getApiInfo.mockResolvedValue({
      _auth: { account: 'acct-1', session: 'tok-1', accessLevel: 'STANDARD' },
    });
    await session.login('ada@example.com', 'pw');

    api.getApiInfo.mockResolvedValue({ _auth: { account: null } });
    await session.refresh();

    expect(onSessionLost).toHaveBeenCalled();
  });
});

describe('logout', () => {
  it('drops everything, including the cookie', async () => {
    api.getApiInfo.mockResolvedValue({
      _auth: { account: 'acct-1', session: 'tok-1', accessLevel: 'STANDARD' },
    });
    await session.login('ada@example.com', 'pw');

    session.logout();

    expect(session.loggedIn).toBe(false);
    expect(session.ownedEvents).toBeNull();
    expect(readCookie()).toBeNull();
  });
});

describe('ownership', () => {
  it('is false before owned events have loaded', () => {
    expect(session.ownedEvents).toBeNull();
    // Not knowing yet must read as "no", so the affordance is hidden rather
    // than shown to someone who may not own the event.
    expect(session.owns('e1')).toBe(false);
  });

  it('is false for a null event id', () => {
    expect(session.owns(null)).toBe(false);
  });
});

describe('the api bridge', () => {
  it('hands the client the current token', async () => {
    connectSessionToApi();
    api.getApiInfo.mockResolvedValue({
      _auth: { account: 'acct-1', session: 'tok-1', accessLevel: 'STANDARD' },
    });
    await session.login('ada@example.com', 'pw');

    expect(getToken()).toBe('tok-1');
    notifyRotate('tok-9');
    expect(session.token).toBe('tok-9');
  });
});
