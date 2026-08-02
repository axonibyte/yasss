/**
 * Authentication state.
 *
 * The server issues a fresh session token on every authenticated response, so
 * the token in hand is only ever valid for one more request. The legacy tracked
 * that in memory but only wrote it back to the cookie inside
 * refreshUserSession, which left the persisted copy stale — reload at the wrong
 * moment and you were logged out. Here every rotation is persisted immediately.
 *
 * See docs/legacy/01-behavior.md §4.
 */
import Cookies from 'js-cookie';
import { installAuthBridge } from '../lib/api/authBridge.js';
import * as api from '../lib/api/index.js';
import { genCreds } from '../lib/crypto/creds.js';

const COOKIE = 'user';

/** Sessions die after roughly refreshInterval x maxHistory of inactivity. */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function readCookie() {
  try {
    const raw = Cookies.get(COOKIE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

class Session {
  account = $state(null);
  token = $state(null);
  accessLevel = $state(null);
  /** Event ids this user administers; null until loaded. */
  ownedEvents = $state(null);

  #timer = null;

  constructor() {
    const stored = readCookie();
    if (stored) {
      this.account = stored.account ?? null;
      this.token = stored.session ?? null;
      this.accessLevel = stored.accessLevel ?? null;
    }
  }

  get loggedIn() {
    return this.account !== null && this.token !== null;
  }

  get isAdmin() {
    return this.accessLevel === 'ADMIN';
  }

  /** True when this user owns the given event, by id. */
  owns(eventId) {
    if (!eventId) return false;
    return this.account !== null && (this.ownedEvents?.includes(eventId) ?? false);
  }

  #persist() {
    if (!this.loggedIn) {
      Cookies.remove(COOKIE, { path: '/' });
      return;
    }
    Cookies.set(
      COOKIE,
      JSON.stringify({
        account: this.account,
        session: this.token,
        accessLevel: this.accessLevel,
      }),
      {
        // The legacy set none of these: a JS-readable host-only session cookie
        // with no SameSite, which browsers increasingly treat as Lax anyway.
        path: '/',
        sameSite: 'Lax',
        secure: location.protocol === 'https:',
      },
    );
  }

  /** Called by the API client on every rotated token. */
  rotate(token) {
    if (!token || token === this.token) return;
    this.token = token;
    this.#persist();
  }

  clear() {
    this.account = null;
    this.token = null;
    this.accessLevel = null;
    this.ownedEvents = null;
    this.#persist();
    this.#stopRefreshTimer();
  }

  /**
   * Sign in. The server has no /login route — authenticating against `GET /v1`
   * with a freshly signed credential payload is the login flow, and the
   * account/session/access-level come back as response headers.
   */
  async login(email, password) {
    const { payload } = await genCreds(email, password);
    const res = await api.getApiInfo({ authToken: payload });
    const { account, session, accessLevel } = res._auth;

    if (!account || !session) {
      throw new Error('Invalid credentials. Try again?');
    }

    this.account = account;
    this.token = session;
    this.accessLevel = accessLevel;
    this.#persist();
    this.#startRefreshTimer();

    await this.loadOwnedEvents();
    return this;
  }

  logout() {
    // There is no server-side logout; the client simply drops the token.
    this.clear();
  }

  /**
   * Validate the stored token at boot. Resolves either way — a failure just
   * means we start anonymous, which is a normal state, not an error.
   */
  async refresh() {
    if (!this.loggedIn) return false;
    try {
      await api.getApiInfo();
      this.#startRefreshTimer();
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  async loadOwnedEvents() {
    if (!this.account) {
      this.ownedEvents = null;
      return;
    }
    try {
      const res = await api.listEvents({ admin: this.account });
      this.ownedEvents = (res.events ?? []).map((e) => e.id);
    } catch {
      // A failure here only means the "Modify Event" affordance stays hidden.
      this.ownedEvents = [];
    }
  }

  #startRefreshTimer() {
    this.#stopRefreshTimer();
    this.#timer = setInterval(() => {
      // Fire and forget; refresh() clears the session if the token is dead.
      this.refresh();
    }, REFRESH_INTERVAL_MS);
  }

  #stopRefreshTimer() {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }
}

export const session = new Session();

/**
 * Wire the API client to this session. Called once at boot, before any request.
 */
export function connectSessionToApi({ onSessionLost } = {}) {
  installAuthBridge({
    getToken: () => session.token,
    onRotate: (token) => session.rotate(token),
    onLost: () => {
      session.clear();
      onSessionLost?.();
    },
  });
}
