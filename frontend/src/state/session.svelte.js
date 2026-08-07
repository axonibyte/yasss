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
import { deriveKey, genCreds } from '../lib/crypto/creds.js';
import { signRequest } from '../lib/crypto/sigreq2.js';
import { authenticate, isSupported } from '../lib/crypto/webauthn.js';

const COOKIE = 'user';

/**
 * How often a signed-in tab re-checks that its session is still good.
 *
 * It is no longer a keepalive. Sessions used to die after roughly
 * `ticket.refreshInterval x ticket.maxHistory` of inactivity — a quarter of an
 * hour with the shipped configuration — and on every restart, because the
 * signing keys lived only in memory. They are durable now and last
 * `session.idleTimeout`, which is days.
 *
 * What the timer is for instead is revocation. A password reset, a ban, or a
 * "sign out everywhere" ends a session server-side and takes effect on the very
 * next request; without this poll an idle tab would keep showing a signed-in
 * chrome until the user clicked something.
 */
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
  /**
   * The address this session signed in with.
   *
   * Kept only so surfaces that offer to reuse it -- reminder opt-in, for one --
   * can prefill without a round trip. The server never returns it; it is known
   * only because the user typed it here.
   */
  email = $state(null);
  /** Event ids this user administers; null until loaded. */
  ownedEvents = $state(null);

  #timer = null;

  constructor() {
    const stored = readCookie();
    if (stored) {
      this.account = stored.account ?? null;
      this.token = stored.session ?? null;
      this.accessLevel = stored.accessLevel ?? null;
      this.email = stored.email ?? null;
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
        email: this.email,
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
    this.email = null;
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
    // An anonymous GET /v1 first, for the audience a v2 credential must name and the
    // server's clock. The audience cannot be guessed: behind a proxy the browser has no
    // reliable way to know the deployment's public name, and signing the wrong one fails
    // every attempt with nothing to say why. It is one extra round trip on the slowest
    // interaction in the app, next to a second of scrypt.
    const info = await api.getApiInfo({ anonymous: true });

    const privkey = await deriveKey(password);

    // Signed against the server's clock rather than ours. A device whose clock is wrong
    // by more than auth.sigMaxSkew would otherwise be told its password is invalid, which
    // is both false and unactionable. Only somebody holding the private key can produce a
    // corrected signature, so this is not a way around the freshness window.
    const skew = typeof info.serverTime === 'number' ? info.serverTime - Date.now() : 0;

    let res;
    if (info.sigAudience) {
      res = await api.getApiInfo({
        authToken: signRequest(privkey, {
          aud: info.sigAudience,
          email,
          now: Date.now() + skew,
        }),
      });
    } else {
      // A server too old to publish an audience. Falls back to the original format, which
      // that server necessarily still accepts.
      const { payload } = await genCreds(email, password);
      res = await api.getApiInfo({ authToken: payload });
    }

    const { account, session, accessLevel } = res._auth;

    if (!account || !session) {
      throw new Error('Invalid credentials. Try again?');
    }

    this.account = account;
    this.token = session;
    this.accessLevel = accessLevel;
    this.email = email.trim().toLowerCase();
    this.#persist();
    this.#startRefreshTimer();

    await this.loadOwnedEvents();
    return this;
  }

  /**
   * Sign in with a passkey.
   *
   * Its own route rather than the `AXB-SIG-REQ` header, because a challenge-response needs
   * a reply in the middle and that header path turns failure into an anonymous request
   * rather than a 401. Everything after the sign-in is identical: the same session ticket,
   * rotated the same way, in the same cookie.
   *
   * @returns {Promise<this|null>} null if the user cancelled, which is not an error
   */
  async loginWithPasskey() {
    if (!isSupported()) throw new Error('This browser does not support passkeys.');

    const challenge = await api.beginPasskeyAuth();
    const assertion = await authenticate(challenge);
    // Cancelled or timed out. The two are indistinguishable and neither is worth a
    // message, so the caller shows nothing.
    if (!assertion) return null;

    const res = await api.finishPasskeyAuth(assertion);
    const { account, session, accessLevel } = res._auth;

    if (!account || !session) throw new Error('That passkey was not accepted.');

    this.account = account;
    this.token = session;
    this.accessLevel = accessLevel;
    // A usernameless sign-in never learns the address from the ceremony, so the server
    // returns it. Without this, `session.email` stays null and every surface that offers
    // to reuse it -- the reminder opt-in prefill -- silently stops working for exactly the
    // users who moved to passkeys.
    this.email = res.email ?? null;
    this.#persist();
    this.#startRefreshTimer();

    await this.loadOwnedEvents();
    return this;
  }

  logout() {
    // Local, deliberately. `DELETE /v1/users/:id/sessions` exists and ends every
    // session on the account, but that is "sign out everywhere" — logging out on
    // a laptop should not sign out a phone. Dropping the ticket is the logout;
    // it is the only copy, and the cookie goes with it.
    this.clear();
  }

  /**
   * Validate the stored token at boot. Resolves either way — a failure just
   * means we start anonymous, which is a normal state, not an error.
   */
  async refresh() {
    if (!this.loggedIn) return false;
    try {
      // GET /v1 authenticates, so it answers the question directly: an account
      // header means the server still recognises this token. Nothing else does
      // -- a missing header on an arbitrary response only means that endpoint
      // does not authenticate, or that the request failed before it could.
      const res = await api.getApiInfo();
      if (!res._auth?.account) {
        this.clear();
        onSessionLost?.();
        return false;
      }
      this.#startRefreshTimer();
      return true;
    } catch {
      // A network failure is not proof the session is dead; leave it alone and
      // let the next attempt decide.
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
let onSessionLost = null;

/**
 * Wire the API client to this session. Called once at boot, before any request.
 *
 * The client only reports rotations; whether a session is still good is decided
 * by `refresh()`, which asks an endpoint that actually authenticates.
 */
export function connectSessionToApi(handlers = {}) {
  onSessionLost = handlers.onSessionLost ?? null;
  installAuthBridge({
    getToken: () => session.token,
    onRotate: (token) => session.rotate(token),
  });
}
