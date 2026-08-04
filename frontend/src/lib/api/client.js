/**
 * The single fetch path for every API call.
 *
 * Centralizes the things the legacy client got wrong or spread across 34 call
 * sites (docs/legacy/01-behavior.md §4, §5):
 *
 *   - JSON Content-Type. The legacy never set it, so jQuery sent
 *     `application/x-www-form-urlencoded` with a JSON string body.
 *   - Session rotation on EVERY response that carries a new token, persisted
 *     immediately. The legacy advanced the in-memory token but only wrote it
 *     back to the cookie in refreshUserSession, so ordinary traffic left the
 *     cookie stale.
 *
 * Rotation here is deliberately *opportunistic*: a response with no session
 * header is not evidence of anything. Only endpoints extending APIEndpoint
 * authenticate at all -- PublicTextEndpoint, for one, does not -- and an error
 * response never gets far enough to issue a token either. Treating a missing
 * header as a lost session logged users out whenever the app fetched a public
 * text or hit a transient 500. Deciding whether a session is still valid is an
 * explicit job, and it belongs to Session.refresh().
 *   - Envelope `status` decides success, not the HTTP code — that is the
 *     contract the app actually relies on.
 *   - Non-JSON bodies (502 HTML, gateway errors, 204) do not throw. The legacy
 *     dereferenced `res.responseJSON` unguarded in ~10 places.
 */
import { ApiError } from './errors.js';
import { getToken, notifyRotate } from './authBridge.js';

const BASE = '/v1';

/**
 * How long any one request may take before it is abandoned.
 *
 * There was no timeout anywhere. A connection that opens and then stalls — a
 * dropped mobile connection, a proxy holding the socket, a server wedged
 * mid-request — leaves `fetch` pending indefinitely, and every caller in this
 * app awaits it: a LoadingButton spins for ever, the unload guard keeps
 * insisting there is unsaved work, and the only way out is a reload.
 *
 * Thirty seconds is well past anything the API legitimately takes — the slowest
 * real call is publishing an event with its whole structure — while still being
 * inside the patience of someone staring at a spinner.
 */
const TIMEOUT_MS = 30_000;

/**
 * Runs a fetch under a deadline, translating an abort into an ApiError.
 *
 * A bare `AbortError` would reach `toastError` as a DOMException with no `info`,
 * so the caller's fallback would be shown — accurate but vague. This says what
 * actually happened, which for a timeout is the useful part: the request may
 * well have been received.
 */
async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new ApiError(
        'That took too long, so we gave up waiting. It may still have gone through — '
        + 'reload before trying again.',
        0,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const SESSION_HEADER = 'axb-session';
const ACCOUNT_HEADER = 'axb-account';
const ACCESS_LEVEL_HEADER = 'axb-access-level';
const CAPTCHA_HEADER = 'X-CAPTCHA-TOKEN';

/**
 * @typedef {object} RequestOptions
 * @property {unknown}       [body]      serialized as JSON when present
 * @property {string|null}   [captcha]   CAPTCHA token, when the endpoint gates on IS_HUMAN
 * @property {string|null}   [authToken] overrides the stored session — used by login,
 *                                       which signs a fresh credential payload instead
 * @property {boolean}       [anonymous] send no Authorization header at all
 * @property {Record<string,unknown>} [query]
 */

function buildUrl(path, query) {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Absorb the auth headers the server attaches to every authenticated response.
 * Returns the account/access-level pair for callers that need it (login).
 */
function absorbAuthHeaders(response) {
  const session = response.headers.get(SESSION_HEADER);
  if (session) notifyRotate(session);

  return {
    account: response.headers.get(ACCOUNT_HEADER),
    accessLevel: response.headers.get(ACCESS_LEVEL_HEADER),
    session,
  };
}

/**
 * @param {string} method
 * @param {string} path
 * @param {RequestOptions} [opts]
 * @returns {Promise<any>} the parsed envelope, with `_auth` attached
 */
export async function request(method, path, opts = {}) {
  const { body, captcha = null, authToken = null, anonymous = false, query } = opts;

  const headers = {};
  const token = anonymous ? null : (authToken ?? getToken());
  if (token) headers.Authorization = `AXB-SIG-REQ ${token}`;
  if (captcha) headers[CAPTCHA_HEADER] = captcha;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetchWithTimeout(buildUrl(path, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const auth = absorbAuthHeaders(response);

  // Never assume a JSON body — see the legacy's ~10 unguarded dereferences.
  const payload = await response.json().catch(() => null);

  const failed = payload
    ? payload.status !== 'ok'
    : !response.ok;

  if (failed) {
    const info = payload?.info ?? `Request failed (${response.status}).`;
    throw new ApiError(info, response.status, payload);
  }

  return { ...(payload ?? {}), _auth: auth };
}

export const get = (path, opts) => request('GET', path, opts);
export const post = (path, body, opts) => request('POST', path, { ...opts, body });
export const patch = (path, body, opts) => request('PATCH', path, { ...opts, body });
export const put = (path, body, opts) => request('PUT', path, { ...opts, body });
export const del = (path, opts) => request('DELETE', path, opts);

/**
 * Fetch a non-JSON resource (the HTML event report, the markdown texts).
 * Bypasses the envelope but still rotates the session.
 */
export async function requestRaw(path, opts = {}) {
  const { anonymous = false, accept } = opts;
  const headers = {};
  const token = anonymous ? null : getToken();
  if (token) headers.Authorization = `AXB-SIG-REQ ${token}`;
  if (accept) headers.Accept = accept;

  const response = await fetchWithTimeout(`${BASE}${path}`, { headers });
  absorbAuthHeaders(response);

  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status}).`, response.status);
  }
  return response;
}
