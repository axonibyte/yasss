/**
 * reCAPTCHA Enterprise, loaded on demand.
 *
 * This deployment uses a **policy-based challenge** key, which is instrumented
 * differently from the checkbox key this file used to drive:
 *
 * - the script is loaded with `render=<siteKey>` rather than `render=explicit`,
 *   because there is no widget for us to place;
 * - a token comes from `grecaptcha.enterprise.execute(siteKey, {action})`
 *   rather than from a callback on a rendered checkbox;
 * - whether the visitor sees anything at all is reCAPTCHA's decision, taken
 *   against thresholds configured on the key. Most of the time they see
 *   nothing; when the policy says otherwise, Google draws its own overlay.
 *
 * That last point is why there is no CAPTCHA modal any more. One would have
 * opened empty and waited for a challenge that usually never comes.
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

/**
 * Obtain a CAPTCHA token if one is needed.
 *
 * @param {string} action which flow this is for; see {@link ACTION}
 * @returns {Promise<string|null>} null when no challenge is required
 */
export async function requireCaptcha(action) {
  if (!captchaEnabled()) return null;
  if (session.loggedIn) return null;

  await ensureLoaded();
  return globalThis.grecaptcha.enterprise.execute(siteKey, { action });
}
