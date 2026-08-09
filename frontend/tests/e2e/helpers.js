/**
 * Shared harness helpers.
 *
 * NOTE: there is deliberately no global reset helper.
 *
 * The suite runs in parallel against a single fake server, so wiping shared
 * state in a beforeEach tears the ground out from under the other workers.
 * Seeded ids and emails are unique per call, and the fake resolves identity
 * from each request rather than from remembered state, so every test is already
 * isolated by the data it creates.
 */
import { expect } from '@playwright/test';

import { SUBMIT_RSVPS } from '../shared/labels.js';

/**
 * Seed users and events.
 *
 * @returns {Promise<{user: object|null, eventId: string|null, session: string|null}>}
 */
export async function seed(request, spec) {
  const res = await request.post('/__test__/seed', { data: spec });
  return res.json();
}

/**
 * Roll one account's signing key, so its next response carries a new token.
 *
 * Scoped to a user because the suite runs in parallel: rolling it platform-wide
 * would change the token every other worker was about to be handed.
 */
export async function rotateSigner(request, userId) {
  const res = await request.post('/__test__/rotate-signer', { data: { user: userId } });
  expect(res.ok()).toBe(true);
}

/**
 * Click a navbar item, opening the mobile menu first if there is one.
 *
 * Below Bulma's tablet breakpoint the items live in a collapsed `navbar-menu`
 * and there is a burger in front of them; above it they are simply there and
 * the burger is not rendered. Tests that reach for a navbar item should not
 * have to know which, and the ones that did know broke the moment the burger
 * arrived -- `compat.spec.js` runs at 412px and went red on three tests that
 * had been correct for as long as the bar had no menu.
 *
 * Deliberately keyed on the burger being *visible* rather than on a viewport
 * width: the breakpoint is Bulma's to move, and a test asserting a number here
 * would be asserting it in the wrong place.
 */
export async function navbarItem(page, name) {
  const burger = page.getByTestId('navbar-burger');
  if (await burger.isVisible()) await burger.click();
  await page.getByRole('link', { name }).click();
}

/** Wait past the boot splash, which is held for a deliberate minimum. */
export async function waitForApp(page) {
  await page.waitForSelector('.pageloader:not(.is-active)', { timeout: 15_000 });
}

/**
 * Arrive already signed in, by installing the session cookie directly.
 *
 * Prefer this to `logIn` everywhere except the specs actually testing the login
 * flow. Deriving a credential payload runs scrypt at N=16384, which costs
 * seconds per call — worth paying once to prove login works, wasteful to pay in
 * every spec that merely needs an authenticated session.
 *
 * The value is percent-encoded because js-cookie decodes on read; the shape
 * mirrors `session.svelte.js`'s persisted cookie.
 */
export async function signIn(page, { user, session }) {
  await page.context().addCookies([{
    name: 'user',
    value: encodeURIComponent(JSON.stringify({
      account: user.id,
      session,
      accessLevel: user.accessLevel,
    })),
    domain: 'localhost',
    path: '/',
    sameSite: 'Lax',
  }]);
}

/** Seed a signed-in user in one step. */
export async function seedSignedIn(page, request, spec = {}) {
  const seeded = await seed(request, { user: spec.user ?? {}, ...spec });
  await signIn(page, { user: seeded.user, session: seeded.session });
  return seeded;
}

/**
 * The real login flow, for the specs that are testing the real login flow.
 * Runs actual key derivation in the browser.
 */
export async function logIn(page, { email, password = 'hunter2' }) {
  await page.getByRole('link', { name: 'Log In' }).click();
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In!' }).click();
}

/**
 * Claim what is pending, and wait for the server to have said so.
 *
 * The button's accessible name carries the count, so the literal it used to be
 * matched on no longer resolves once anything is pending. The click and the
 * toast travel together because a click that reports nothing is exactly the
 * failure this button was gated to prevent.
 */
export async function submitRsvps(page) {
  await page.getByRole('button', { name: SUBMIT_RSVPS }).click();
  await expect(page.getByText('RSVP successfully submitted!')).toBeVisible();
}
