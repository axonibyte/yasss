/**
 * API client contract — docs/legacy/01-behavior.md §4.4, §5.
 *
 * These pin the behaviors the legacy spread across 34 call sites and got wrong
 * in several: envelope-over-HTTP-status, session rotation on every response,
 * and never assuming a JSON body.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { request, get, post } from '../../src/lib/api/client.js';
import { installAuthBridge, resetAuthBridge } from '../../src/lib/api/authBridge.js';
import { ApiError, isNotFound, isUnpublished } from '../../src/lib/api/errors.js';

/**
 * Build a Response-like stub. `noBody: true` simulates a non-JSON response
 * (a 502 HTML page, a gateway error, a 204) — note it cannot be expressed as
 * `body: undefined`, which a destructuring default would silently replace.
 */
function reply({ status = 200, body = { status: 'ok' }, headers = {}, noBody = false, text } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => (noBody
      ? Promise.reject(new SyntaxError('Unexpected token < in JSON'))
      : Promise.resolve(body)),
    text: () => Promise.resolve(text ?? ''),
  };
}

let fetchMock;

beforeEach(() => {
  resetAuthBridge();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;
});

describe('request shaping', () => {
  it('prefixes /v1 and sets a JSON content type when there is a body', async () => {
    fetchMock.mockResolvedValue(reply());
    await post('/events', { a: 1 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/v1/events');
    // The legacy never set this, so jQuery sent form-urlencoded with a JSON body.
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });

  it('sends no content type when there is no body', async () => {
    fetchMock.mockResolvedValue(reply());
    await get('/events/abc');
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('builds query strings and drops empty values', async () => {
    fetchMock.mockResolvedValue(reply());
    await get('/events', { query: { admin: 'x', label: '', earliest: 0, missing: null } });
    // 0 is meaningful and must survive; '' and null must not.
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/events?admin=x&earliest=0');
  });

  it('attaches the session token from the auth bridge', async () => {
    installAuthBridge({ getToken: () => 'TOKEN' });
    fetchMock.mockResolvedValue(reply({ headers: { 'axb-session': 'NEXT' } }));
    await get('/events');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('AXB-SIG-REQ TOKEN');
  });

  it('lets a caller override the token, as login does', async () => {
    installAuthBridge({ getToken: () => 'STORED' });
    fetchMock.mockResolvedValue(reply({ headers: { 'axb-session': 'NEXT' } }));
    await get('', { authToken: 'FRESHLY-SIGNED' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('AXB-SIG-REQ FRESHLY-SIGNED');
  });

  it('sends no Authorization header when anonymous', async () => {
    installAuthBridge({ getToken: () => 'TOKEN' });
    fetchMock.mockResolvedValue(reply());
    await get('/events/abc', { anonymous: true });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('sends the CAPTCHA header when given a token', async () => {
    fetchMock.mockResolvedValue(reply());
    await post('/users', { email: 'a@b.co' }, { captcha: 'CAPTCHA', anonymous: true });
    expect(fetchMock.mock.calls[0][1].headers['X-CAPTCHA-TOKEN']).toBe('CAPTCHA');
  });
});

describe('session rotation', () => {
  it('reports the rotated token on every response', async () => {
    const onRotate = vi.fn();
    installAuthBridge({ getToken: () => 'OLD', onRotate });
    fetchMock.mockResolvedValue(reply({ headers: { 'axb-session': 'ROTATED' } }));

    await get('/events');
    // The legacy advanced the in-memory token but only wrote it back to the
    // cookie inside refreshUserSession, leaving the cookie stale.
    expect(onRotate).toHaveBeenCalledWith('ROTATED');
  });

  it('never infers a lost session from a missing header', async () => {
    // Only endpoints extending APIEndpoint authenticate at all, and an error
    // response never gets far enough to issue a token — so a missing header is
    // not evidence of anything. Inferring loss from it logged users out
    // whenever the app fetched a public text or hit a transient 500.
    // Session.refresh() decides validity by asking an endpoint that authenticates.
    const onRotate = vi.fn();
    installAuthBridge({ getToken: () => 'TOKEN', onRotate });

    fetchMock.mockResolvedValue(reply()); // 200, no session header
    await expect(get('/texts/coa')).resolves.toBeTruthy();

    fetchMock.mockResolvedValue(reply({ status: 500, body: { status: 'error', info: 'boom' } }));
    await expect(get('/events')).rejects.toBeInstanceOf(ApiError);

    expect(onRotate).not.toHaveBeenCalled();
  });

  it('surfaces the account and access level for login', async () => {
    fetchMock.mockResolvedValue(reply({
      headers: {
        'axb-session': 'S', 'axb-account': 'ACCT', 'axb-access-level': 'STANDARD',
      },
    }));
    const res = await get('', { authToken: 'SIGNED' });
    expect(res._auth).toMatchObject({ account: 'ACCT', accessLevel: 'STANDARD', session: 'S' });
  });
});

describe('failure handling', () => {
  it('trusts the envelope status over the HTTP code', async () => {
    // A 200 carrying {"status":"error"} is a failure — the contract the app
    // actually relies on (app.js:1383).
    fetchMock.mockResolvedValue(reply({ status: 200, body: { status: 'error', info: 'nope' } }));
    await expect(get('/events')).rejects.toThrow('nope');
  });

  it('carries the HTTP status for flow-specific messages', async () => {
    fetchMock.mockResolvedValue(reply({
      status: 402, body: { status: 'error', info: 'event not published' },
    }));
    const err = await get('/events/abc').catch((e) => e);
    expect(isUnpublished(err)).toBe(true);
    expect(isNotFound(err)).toBe(false);
    expect(err.info).toBe('event not published');
  });

  it('does not throw a TypeError on a non-JSON error body', async () => {
    // The legacy dereferenced res.responseJSON unguarded in ~10 places, so a
    // 502 HTML page threw inside the completion handler (behavior §6.9).
    fetchMock.mockResolvedValue(reply({ status: 502, noBody: true }));
    const err = await get('/events').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.httpStatus).toBe(502);
  });

  it('accepts a success with no body at all', async () => {
    fetchMock.mockResolvedValue(reply({ status: 204, noBody: true }));
    await expect(get('/events')).resolves.toBeTruthy();
  });

  it('propagates network errors untouched', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(get('/events')).rejects.toThrow('Failed to fetch');
  });
});

describe('verbs', () => {
  it.each([
    ['GET', () => request('GET', '/x')],
    ['POST', () => request('POST', '/x', { body: {} })],
    ['PATCH', () => request('PATCH', '/x', { body: {} })],
    ['PUT', () => request('PUT', '/x', { body: {} })],
    ['DELETE', () => request('DELETE', '/x')],
  ])('issues %s', async (method, call) => {
    fetchMock.mockResolvedValue(reply());
    await call();
    expect(fetchMock.mock.calls[0][1].method).toBe(method);
  });
});
