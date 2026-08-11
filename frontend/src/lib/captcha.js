/**
 * reCAPTCHA Enterprise, loaded on demand.
 *
 * Both kinds of key are supported, because which one a deployment holds is not
 * always known when it is configured, and a key can be swapped for the other.
 *
 * The usual path is a **policy-based challenge** key, which is instrumented
 * differently from a checkbox key:
 *
 * - the script is loaded with `render=<siteKey>` rather than `render=explicit`,
 *   because there is no widget for us to place;
 * - a token comes from `grecaptcha.enterprise.execute(siteKey, {action})`
 *   rather than from a callback on a rendered checkbox;
 * - whether the visitor sees anything at all is reCAPTCHA's decision, taken
 *   against thresholds configured on the key. Most of the time they see
 *   nothing; when the policy says otherwise, Google draws its own overlay.
 *
 * That last point is why the CAPTCHA modal is not the usual path any more: for
 * a policy-based key it would open empty and wait for a challenge that usually
 * never comes.
 *
 * ## Which kind of key this is, and where that is discovered
 *
 * It is discovered at the **script tag**, not at `execute`. That distinction
 * cost a production outage and is the reason this file is shaped the way it is.
 *
 * `enterprise.js?render=<siteKey>` is not served for a checkbox key at all:
 * Google answers **HTTP 400** and the tag fires `onerror`. So for exactly the
 * key type the fallback exists to serve, `execute` is never defined, never
 * called, and never rejects -- the failure happens a step earlier, while the
 * script is loading. A fallback hung off `execute` rejecting is therefore
 * unreachable precisely when it is needed, and every anonymous publish, RSVP,
 * register and reset fails with whatever the caller says when it catches.
 *
 * So the load is the probe: try `render=<siteKey>`, and when the tag errors,
 * load `render=explicit` and take the widget path. `execute` rejecting is still
 * handled below, because a policy key can refuse a token for its own reasons,
 * but it is the second line of defence rather than the first.
 *
 * Two legacy behaviors are still deliberately preserved here:
 *
 * 1. The script is injected only once the server reports a site key, rather
 *    than sitting in the page for every visitor of every deployment.
 *
 * 2. When there is no site key, `requireCaptcha` resolves immediately with
 *    null. The legacy called into reCAPTCHA regardless, which threw and left
 *    anonymous publish, RSVP, register and reset all dead in a
 *    CAPTCHA-disabled deployment (behavior §6.17).
 *
 * Logged-in users skip the challenge entirely, as they always did.
 *
 * Google's badge appears bottom-right once the script loads. It is not
 * decoration: showing it is how their branding requirement is met, and hiding
 * it obliges us to display the attribution text instead.
 */
import { session } from '../state/session.svelte.js';

/**
 * The actions a token can be minted for.
 *
 * Named per flow because a policy-based key can carry a different risk
 * threshold for each one -- publishing an event and resetting a password are
 * not equally worth challenging. Google restricts these to letters, numbers,
 * slashes and underscores.
 */
export const ACTION = {
  PUBLISH_EVENT: 'publish_event',
  PUBLISH_POLL: 'publish_poll',
  ADD_VOLUNTEER: 'add_volunteer',
  ANSWER_POLL: 'answer_poll',
  REGISTER: 'register',
  RESET_PASSWORD: 'reset_password',
  VERIFY_USER: 'verify_user',
};

/** How a token is obtained, once the load has settled it. */
const POLICY = 'policy';
const CHECKBOX = 'checkbox';

let siteKey = null;
let scriptPromise = null;
let keyKind = null;

/** Record what `GET /v1` reported. A missing key means CAPTCHAs are off. */
export function configureCaptcha(key) {
  siteKey = key || null;
  // A different key may well be a different kind, so nothing learned about the
  // last one survives. In practice this is called once at boot; it matters for
  // tests, which reconfigure between cases.
  scriptPromise = null;
  keyKind = null;
}

export const captchaEnabled = () => siteKey !== null;

const present = () => Boolean(globalThis.grecaptcha?.enterprise);

const SCRIPT = 'https://www.google.com/recaptcha/enterprise.js';

/** Inject one script tag and settle when it loads or errors. */
function inject(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Failed to load the CAPTCHA.'));
    document.head.appendChild(el);
  });
}

/** Wait for grecaptcha to finish initializing after the script loads. */
function whenReady() {
  return new Promise((resolve, reject) => {
    if (!globalThis.grecaptcha?.enterprise?.ready) {
      reject(new Error('The CAPTCHA failed to load.'));
      return;
    }
    globalThis.grecaptcha.enterprise.ready(resolve);
  });
}

/**
 * Make sure reCAPTCHA is available, and settle which kind of key this is.
 *
 * Skips loading entirely when it is already present, which is what makes this
 * idempotent across several challenges in one session -- and what lets a test
 * supply its own `grecaptcha` without going near the network.
 *
 * A failed load clears the cached promise so a later attempt genuinely retries.
 * Otherwise one dropped request at boot would poison every challenge for the
 * lifetime of the tab.
 */
function ensureLoaded() {
  if (scriptPromise) return scriptPromise;

  scriptPromise = (async () => {
    if (present()) {
      // Supplied by a test, or already loaded by an earlier call that raced
      // this one. Its capabilities say which path it supports.
      keyKind = globalThis.grecaptcha.enterprise.execute ? POLICY : CHECKBOX;
      return;
    }

    try {
      await inject(`${SCRIPT}?render=${encodeURIComponent(siteKey)}&hl=en`);
      keyKind = POLICY;
    } catch {
      // Not a retry: this URL is the *other* integration, and reaching it means
      // Google refused to serve the programmatic one for this key. See the
      // header -- this is where a checkbox key is identified, and the only
      // place it can be.
      await inject(`${SCRIPT}?render=explicit&hl=en`);
      keyKind = CHECKBOX;
    }

    await whenReady();
  })().catch((e) => {
    scriptPromise = null;
    keyKind = null;
    throw e;
  });

  return scriptPromise;
}

/** Widget id for the checkbox fallback, so a re-render resets rather than stacks. */
let widgetId = null;

/**
 * Render a checkbox widget and resolve with its token.
 *
 * The fallback path, for a deployment holding a checkbox key. Exported because
 * the modal owns the container it renders into.
 *
 * @param {HTMLElement} container
 * @returns {Promise<string>}
 */
export function renderWidget(container) {
  return new Promise((resolve, reject) => {
    if (widgetId !== null) {
      globalThis.grecaptcha.enterprise.reset(widgetId);
    }
    try {
      widgetId = globalThis.grecaptcha.enterprise.render(container, {
        sitekey: siteKey,
        callback: resolve,
        'error-callback': () => reject(new Error('The CAPTCHA failed to verify.')),
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Obtain a CAPTCHA token if one is needed.
 *
 * @param {string} action which flow this is for; see {@link ACTION}
 * @param {() => Promise<string>} [show] shows the fallback modal, when there is
 *        one to show; omitted, a checkbox key simply fails
 * @returns {Promise<string|null>} null when no challenge is required
 */
export async function requireCaptcha(action, show = null) {
  if (!captchaEnabled()) return null;
  if (session.loggedIn) return null;

  await ensureLoaded();

  // Settled by the load, because for a checkbox key there is no `execute` to
  // ask and never was.
  if (keyKind === CHECKBOX) {
    if (!show) throw new Error('This CAPTCHA needs a checkbox, and there is nowhere to show it.');
    return show();
  }

  try {
    return await globalThis.grecaptcha.enterprise.execute(siteKey, { action });
  } catch (e) {
    // Any refusal, not a message match: reCAPTCHA's wording is not contractual,
    // and a transient failure falling through to a widget that then reports its
    // own error is a better outcome than one that reports nothing.
    if (!show) throw e;
    return show();
  }
}
