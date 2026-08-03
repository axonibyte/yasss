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

  beforeEach(async () => {
    vi.resetModules();
    captcha = await import('../../src/lib/captcha.js');
    ({ session } = await import('../../src/state/session.svelte.js'));
    session.clear();
  });

  it('resolves with null when the deployment has no site key', async () => {
    captcha.configureCaptcha(null);
    const present = vi.fn();

    // The legacy called reset() on a widget that had never been rendered here,
    // which threw and left anonymous publish, RSVP, register and reset all dead.
    await expect(captcha.requireCaptcha(present)).resolves.toBeNull();
    expect(present).not.toHaveBeenCalled();
  });

  it('resolves with null for a signed-in user', async () => {
    captcha.configureCaptcha('site-key');
    session.account = 'acct-1';
    session.token = 'tok-1';
    const present = vi.fn();

    await expect(captcha.requireCaptcha(present)).resolves.toBeNull();
    expect(present).not.toHaveBeenCalled();
  });

  it('presents the challenge for an anonymous visitor when configured', async () => {
    captcha.configureCaptcha('site-key');
    const present = vi.fn().mockResolvedValue('a-token');

    await expect(captcha.requireCaptcha(present)).resolves.toBe('a-token');
    expect(present).toHaveBeenCalled();
  });
});
