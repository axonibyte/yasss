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
 * A **checkbox** key has no `execute` at all, so the two are told apart by
 * trying the policy path and falling back when it refuses. That is a runtime
 * discovery rather than a guess about configuration, and the fallback is a
 * rendered widget in a modal -- the integration this file used to have.
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

let siteKey = null;
let scriptPromise = null;

/** Record what `GET /v1` reported. A missing key means CAPTCHAs are off. */
export function configureCaptcha(key) {
  siteKey = key || null;
}

export const captchaEnabled = () => siteKey !== null;

const loaded = () => Boolean(globalThis.grecaptcha?.enterprise?.execute);

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    // The key goes in the URL for a policy-based key; `render=explicit` is for
    // a checkbox, and with it `execute` is never defined.
    el.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}&hl=en`;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Failed to load the CAPTCHA.'));
    document.head.appendChild(el);
  });
  return scriptPromise;
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
 * Make sure reCAPTCHA is available.
 *
 * Skips loading entirely when it is already present, which is what makes this
 * idempotent across several challenges in one session -- and what lets a test
 * supply its own `grecaptcha` without going near the network.
 */
async function ensureLoaded() {
  if (loaded()) return;
  await loadScript();
  await whenReady();
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
 * Tries the policy-based path first and falls back to a checkbox when the key
 * turns out not to support it. The order matters: `execute` on a checkbox key
 * refuses immediately and locally, whereas rendering a widget for a
 * policy-based key would put an empty box in front of somebody and wait.
 *
 * @param {string} action which flow this is for; see {@link ACTION}
 * @param {() => Promise<string>} [present] shows the fallback modal, when there
 *        is one to show; omitted, a checkbox key simply fails
 * @returns {Promise<string|null>} null when no challenge is required
 */
export async function requireCaptcha(action, present = null) {
  if (!captchaEnabled()) return null;
  if (session.loggedIn) return null;

  await ensureLoaded();

  try {
    return await globalThis.grecaptcha.enterprise.execute(siteKey, { action });
  } catch (e) {
    // Any refusal, not a message match: reCAPTCHA's wording for "this key has
    // no execute path" is not contractual, and a transient failure falling
    // through to a widget that then reports its own error is a better outcome
    // than one that reports nothing.
    if (!present) throw e;
    return present();
  }
}
