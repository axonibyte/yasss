/**
 * The handful of API-surface decisions worth pinning.
 *
 * `api/index.js` is one-liners over an already-tested client, so asserting
 * every URL would be coverage theatre. These four encode real decisions that a
 * refactor could silently undo, and each has a failure mode that is invisible
 * until it matters.
 *
 * Also covers `requireCaptcha`, whose three branches gate five flows that were
 * all dead in the legacy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as api from '../../src/lib/api/index.js';
import { installAuthBridge, resetAuthBridge } from '../../src/lib/api/authBridge.js';

let fetchMock;

const reply = (body = { status: 'ok' }, headers = {}) => ({
  ok: true,
  status: 200,
  headers: new Headers(headers),
  json: () => Promise.resolve(body),
  text: () => Promise.resolve('# text'),
});

beforeEach(() => {
  resetAuthBridge();
  fetchMock = vi.fn().mockResolvedValue(reply());
  globalThis.fetch = fetchMock;
});

describe('credentials are sent only where they are wanted', () => {
  it('resolving a short code carries no session', async () => {
    installAuthBridge({ getToken: () => 'TOKEN' });
    await api.resolveCode('ABCD-1234');

    // Holding the code is the permission, and the endpoint says only what kind
    // of thing exists. Sending a session to it would make the one call every
    // visitor makes before they have an account the one call that carries one.
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toContain('/codes/ABCD-1234');
  });

  it('reads a poll with the respondent token as a query parameter', async () => {
    await api.getPoll('p-1', 'tok-9');

    // In the query rather than the body, because this is a GET -- and it is
    // what lets the server return the caller their own answer, and decide
    // whether an "after you answer" result setting has been met.
    expect(fetchMock.mock.calls[0][0]).toContain('token=tok-9');
  });

  it('omits the token entirely when there is not one', async () => {
    await api.getPoll('p-1');
    expect(fetchMock.mock.calls[0][0]).not.toContain('token');
  });

  it('registration carries no session', async () => {
    installAuthBridge({ getToken: () => 'STALE-TOKEN' });
    await api.registerUser('a@b.co', 'PUBKEY', 'captcha');

    // Registering is definitionally an anonymous act; letting a stale session
    // ride along would have the server authenticate somebody else's account
    // while creating a new one.
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('public texts carry no session', async () => {
    installAuthBridge({ getToken: () => 'TOKEN' });
    await api.getText('coa');

    // PublicTextEndpoint does not authenticate, so it issues no rotated token.
    // Sending credentials there is pointless, and it used to make the client
    // conclude the session had been lost.
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('the report does carry the session, being owner-only', async () => {
    installAuthBridge({ getToken: () => 'TOKEN' });
    fetchMock.mockResolvedValue({ ...reply(), blob: () => Promise.resolve(new Blob()) });
    await api.getEventReport('e1');

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('AXB-SIG-REQ TOKEN');
  });
});

describe('url construction', () => {
  it('percent-encodes an email in the reset path', async () => {
    await api.requestPasswordReset('a+tag@b.co', null);

    // The endpoint accepts an email *or* an id in that position, so a raw `+`
    // or `/` would build a different URL than intended.
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/users/a%2Btag%40b.co');
  });

  it('drops empty query values from a listing', async () => {
    await api.listEvents({ admin: 'acct-1', label: '', earliest: 0, volunteer: null });

    // 0 is a meaningful timestamp and must survive; '' and null must not.
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/events?admin=acct-1&earliest=0');
  });

  it('sends an empty rsvps array with a new volunteer', async () => {
    await api.addVolunteer('e1', { name: 'Ada', details: [] }, null);

    // Belt and braces over the serializer: omitting it is a 500.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).rsvps).toEqual([]);
  });
});

describe('requireCaptcha', () => {
  let captcha;
  let session;
  let execute;

  beforeEach(async () => {
    vi.resetModules();
    captcha = await import('../../src/lib/captcha.js');
    ({ session } = await import('../../src/state/session.svelte.js'));
    session.clear();

    // Supplied rather than loaded. `requireCaptcha` skips the script tag when
    // reCAPTCHA is already present, so this exercises the real path without
    // going near Google -- and without a script `onload` that jsdom would never
    // fire.
    execute = vi.fn().mockResolvedValue('a-token');
    globalThis.grecaptcha = { enterprise: { ready: (cb) => cb(), execute } };
  });

  it('resolves with null when the deployment has no site key', async () => {
    captcha.configureCaptcha(null);

    // The legacy called into reCAPTCHA regardless, which threw and left
    // anonymous publish, RSVP, register and reset all dead.
    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT)).resolves.toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('resolves with null for a signed-in user', async () => {
    captcha.configureCaptcha('site-key');
    session.account = 'acct-1';
    session.token = 'tok-1';

    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT)).resolves.toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('mints a token against the site key for an anonymous visitor', async () => {
    captcha.configureCaptcha('site-key');

    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT)).resolves.toBe('a-token');
    expect(execute).toHaveBeenCalledWith('site-key', { action: 'publish_event' });
  });

  /**
   * The action travels with the token, and a policy-based key can carry a
   * different risk threshold for each one. Sending the same action everywhere
   * would quietly collapse that back to one threshold.
   */
  it('names the flow the token was minted for', async () => {
    captcha.configureCaptcha('site-key');

    await captcha.requireCaptcha(captcha.ACTION.RESET_PASSWORD);
    expect(execute).toHaveBeenCalledWith('site-key', { action: 'reset_password' });
  });

  it('gives every flow a distinct action', () => {
    const actions = Object.values(captcha.ACTION);
    expect(new Set(actions).size).toBe(actions.length);
    // Google restricts actions to letters, numbers, slashes and underscores.
    for (const action of actions) expect(action).toMatch(/^[a-zA-Z0-9/_-]+$/);
  });
});

