/**
 * reCAPTCHA Enterprise, loaded on demand.
 *
 * Two legacy behaviors are deliberately changed here:
 *
 * 1. The script tag was in the page unconditionally, so every visitor loaded
 *    Google's bundle whether or not the deployment used CAPTCHAs. It is now
 *    injected only once the server reports a site key.
 *
 * 2. `renderCAPTCHA` ignored whether CAPTCHAs were configured at all: with them
 *    disabled it still called `grecaptcha.enterprise.reset()` on a widget that
 *    had never been rendered, which threw and meant the continuation never ran.
 *    Anonymous publish, RSVP, register and reset were all dead in a
 *    CAPTCHA-disabled deployment (behavior §6.17). When there is no site key,
 *    `requireCaptcha` now resolves immediately with null.
 *
 * Logged-in users skip the challenge entirely, as they did before.
 */
import { session } from '../state/session.svelte.js';

const SCRIPT_URL =
  'https://www.google.com/recaptcha/enterprise.js?render=explicit&hl=en';

let siteKey = null;
let scriptPromise = null;
let widgetId = null;

/** Record what `GET /v1` reported. A missing key means CAPTCHAs are off. */
export function configureCaptcha(key) {
  siteKey = key || null;
}

export const captchaEnabled = () => siteKey !== null;

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_URL;
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
  return new Promise((resolve) => {
    const check = () => {
      if (window.grecaptcha?.enterprise?.render) resolve();
      else setTimeout(check, 50);
    };
    check();
  });
}

/**
 * Render the widget into a container and resolve with the caller's token.
 *
 * @param {HTMLElement} container
 * @returns {Promise<string>}
 */
export async function renderWidget(container) {
  await loadScript();
  await whenReady();

  return new Promise((resolve, reject) => {
    if (widgetId !== null) {
      window.grecaptcha.enterprise.reset(widgetId);
    }
    try {
      widgetId = window.grecaptcha.enterprise.render(container, {
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
 * @param {() => Promise<string>} present  shows the modal and resolves with a token
 * @returns {Promise<string|null>} null when no challenge is required
 */
export async function requireCaptcha(present) {
  if (!captchaEnabled()) return null;
  if (session.loggedIn) return null;
  return present();
}
