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

  /**
   * A checkbox key has no execute path, so the token has to come from a
   * rendered widget instead. Discovered by trying, not configured -- which is
   * what lets one build serve a deployment holding either kind.
   */
  it('falls back to the checkbox widget when the key has no execute path', async () => {
    captcha.configureCaptcha('site-key');
    execute.mockRejectedValue(new Error('Invalid key type'));
    const present = vi.fn().mockResolvedValue('widget-token');

    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT, present))
      .resolves.toBe('widget-token');
    expect(present).toHaveBeenCalled();
  });

  /** With nowhere to show a widget, the refusal is reported rather than eaten. */
  it('reports the failure when there is no fallback to show', async () => {
    captcha.configureCaptcha('site-key');
    execute.mockRejectedValue(new Error('Invalid key type'));

    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT))
      .rejects.toThrow('Invalid key type');
  });

  /** The usual path never shows anybody anything. */
  it('does not present a widget when the policy key mints a token', async () => {
    captcha.configureCaptcha('site-key');
    const present = vi.fn();

    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT, present))
      .resolves.toBe('a-token');
    expect(present).not.toHaveBeenCalled();
  });

  /**
   * The regression that took anonymous publishing down in production.
   *
   * Google does not serve `enterprise.js?render=<siteKey>` for a checkbox key:
   * it answers 400, the tag fires `onerror`, and `execute` is never defined. The
   * fallback used to hang off `execute` rejecting, so it could not be reached in
   * the one case it existed for -- the load threw a step earlier and every
   * anonymous publish, RSVP, register and reset died with "sorry".
   *
   * Driven through real script tags rather than a supplied `grecaptcha`,
   * because the entire defect lived in the injection path and supplying one
   * skips it.
   */
  it('loads the explicit script and shows a widget when the key refuses render=<key>', async () => {
    delete globalThis.grecaptcha;
    captcha.configureCaptcha('site-key');

    const requested = [];
    const appendChild = vi.spyOn(document.head, 'appendChild').mockImplementation((el) => {
      requested.push(el.src);
      queueMicrotask(() => {
        if (el.src.includes('render=explicit')) {
          // The explicit script defines `render` and no `execute`.
          globalThis.grecaptcha = { enterprise: { ready: (cb) => cb(), render: vi.fn() } };
          el.onload();
        } else el.onerror(); // Google's 400
      });
      return el;
    });

    const show = vi.fn().mockResolvedValue('widget-token');
    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT, show))
      .resolves.toBe('widget-token');

    expect(requested[0]).toContain('render=site-key');
    expect(requested[1]).toContain('render=explicit');
    expect(show).toHaveBeenCalled();
    appendChild.mockRestore();
  });

  /** A policy key loads first time, and the explicit script is never asked for. */
  it('asks for the explicit script only when the first one fails', async () => {
    delete globalThis.grecaptcha;
    captcha.configureCaptcha('site-key');

    const requested = [];
    const appendChild = vi.spyOn(document.head, 'appendChild').mockImplementation((el) => {
      requested.push(el.src);
      queueMicrotask(() => {
        globalThis.grecaptcha = {
          enterprise: { ready: (cb) => cb(), execute: vi.fn().mockResolvedValue('a-token') },
        };
        el.onload();
      });
      return el;
    });

    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT)).resolves.toBe('a-token');
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain('render=site-key');
    appendChild.mockRestore();
  });

  /**
   * A checkbox key with nowhere to show a widget refuses rather than calling an
   * `execute` that is not there -- which would be a TypeError, not a refusal.
   */
  it('reports a checkbox key it cannot present', async () => {
    delete globalThis.grecaptcha;
    globalThis.grecaptcha = { enterprise: { ready: (cb) => cb(), render: vi.fn() } };
    captcha.configureCaptcha('site-key');

    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT))
      .rejects.toThrow('nowhere to show it');
  });

  /** One dropped request must not poison every challenge for the tab's life. */
  it('retries the load after a failure rather than caching it', async () => {
    delete globalThis.grecaptcha;
    captcha.configureCaptcha('site-key');

    let attempts = 0;
    const appendChild = vi.spyOn(document.head, 'appendChild').mockImplementation((el) => {
      attempts += 1;
      queueMicrotask(() => el.onerror());
      return el;
    });

    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT)).rejects.toThrow();
    const afterFirst = attempts;
    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT)).rejects.toThrow();
    expect(attempts).toBeGreaterThan(afterFirst);
    appendChild.mockRestore();
  });

  /**
   * The incident's second half: the visitor was told "Couldn't publish your
   * poll... sorry" when the poll was fine and the CAPTCHA had failed to load.
   *
   * `toastError` renders `error.info` and falls back to the caller's generic
   * sentence otherwise, so an error from here without one is guaranteed to
   * reach somebody as the wrong explanation.
   */
  it('throws errors the toast layer can show, rather than a generic sorry', async () => {
    delete globalThis.grecaptcha;
    captcha.configureCaptcha('site-key');

    const appendChild = vi.spyOn(document.head, 'appendChild').mockImplementation((el) => {
      queueMicrotask(() => el.onerror());
      return el;
    });

    await expect(captcha.requireCaptcha(captcha.ACTION.PUBLISH_EVENT))
      .rejects.toMatchObject({ info: expect.stringContaining('CAPTCHA') });
    appendChild.mockRestore();
  });

  it('gives every flow a distinct action', () => {
    const actions = Object.values(captcha.ACTION);
    expect(new Set(actions).size).toBe(actions.length);
    // Google restricts actions to letters, numbers, slashes and underscores.
    for (const action of actions) expect(action).toMatch(/^[a-zA-Z0-9/_-]+$/);
  });
});

