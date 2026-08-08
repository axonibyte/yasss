/**
 * What the simulated users' state looks like in a real browser.
 *
 * `e2e/journeys/journey.mjs` drives a long multi-actor run over the API and
 * leaves its actors and its expectations in `handle.json`. That tier can prove
 * the server holds the right data; it cannot see what the app does with it. This
 * one signs in as each actor -- against state built by hundreds of prior actions
 * rather than a fixture -- and looks.
 *
 * Skipped, not failed, when no journey has run: the file is absent in an
 * ordinary browser stage and this must not turn that red.
 *
 * The request-rate check is the reason this spec exists at all. A dashboard that
 * re-fetches in a loop answers 200 every time and throws nothing, so neither the
 * server's oracle nor the page-error watchdog can see it. It is only visible as
 * a count.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, ready } from './helpers/harness.js';

const HANDLE = fileURLToPath(new URL('../../../e2e/journeys/handle.json', import.meta.url));

const handle = existsSync(HANDLE) ? JSON.parse(readFileSync(HANDLE, 'utf8')) : null;

/**
 * How many times one endpoint may be called for a single page view.
 *
 * A dashboard load legitimately makes a handful: the API probe, the two event
 * listings, the texts. Fifteen is far above that and far below a loop -- the one
 * that shipped managed about 140 a second until the tab was closed.
 */
const MAX_CALLS_PER_ENDPOINT = 15;

/** Long enough for anything runaway to make itself obvious. */
const SETTLE_MS = 4000;

/**
 * Arrive already signed in, by installing the session cookie.
 *
 * The engine already holds a valid ticket for each actor, so there is nothing to
 * be gained by paying for scrypt at N=16384 in the browser -- which
 * `harness.js` notes costs seconds per login. The shape mirrors
 * `session.svelte.js`'s persisted cookie; js-cookie decodes on read, hence the
 * encoding.
 */
async function signInAs(page, baseURL, actor) {
  await page.context().addCookies([{
    name: 'user',
    value: encodeURIComponent(JSON.stringify({
      account: actor.account,
      session: actor.session,
      accessLevel: 'STANDARD',
    })),
    domain: new URL(baseURL).hostname,
    path: '/',
    sameSite: 'Lax',
  }]);
}

/** Count API calls by method and path, ignoring ids so a loop shows up as one key. */
function countApiCalls(page) {
  const counts = new Map();
  page.on('request', (req) => {
    let url;
    try { url = new URL(req.url()); } catch { return; }
    if (!url.pathname.startsWith('/v1')) return;
    // Collapse ids so repeated calls for one resource aggregate.
    const shape = url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id');
    const key = `${req.method()} ${shape}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

const worst = (counts) => [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['none', 0];

// Chosen at collection time rather than with `test.skip` inside the group: the
// whole suite is meaningless without a handle, and this form is unambiguous
// about skipping the group rather than each test in it.
const describe = handle ? test.describe : test.describe.skip;

describe('journey audit', () => {
  test('every actor loads their dashboard once, and only once', async ({ page, baseURL }) => {
    for (const actor of handle.actors) {
      const counts = countApiCalls(page);
      await signInAs(page, baseURL, actor);

      await page.goto('/');
      await ready(page);
      await page.waitForTimeout(SETTLE_MS);

      const [endpoint, calls] = worst(counts);
      expect(
        calls,
        `${actor.name}'s dashboard called ${endpoint} ${calls} times for one page view. `
        + 'An effect that depends on something the response changes re-runs itself; '
        + 'this is what that looks like from outside.',
      ).toBeLessThanOrEqual(MAX_CALLS_PER_ENDPOINT);

      await page.context().clearCookies();
    }
  });

  test('the dashboard lists each event once', async ({ page, baseURL }) => {
    for (const expected of handle.expectedListings) {
      const actor = handle.actors.find((a) => a.name === expected.name);
      if (!actor || (!expected.owned.length && !expected.volunteered.length)) continue;

      await signInAs(page, baseURL, actor);
      await page.goto('/');
      await ready(page);

      // Per box, not across the pair. The dashboard shows "Your Upcoming
      // Events" and "Your Upcoming RSVPs" side by side, and an event you both
      // organise and have signed up to belongs in each -- counting across the
      // two reads that as a duplicate when it is the product working.
      //
      // A genuinely repeated id would already have thrown each_key_duplicate
      // and been caught by the watchdog; this is the weaker but more legible
      // statement of the same thing.
      const lists = page.locator('#list-event-section ul');
      await expect(lists.first()).toBeVisible({ timeout: 15_000 });

      for (let i = 0; i < await lists.count(); i += 1) {
        const titles = await lists.nth(i).locator('li').allInnerTexts();
        const counted = new Map();
        for (const t of titles.map((s) => s.trim()).filter(Boolean)) {
          counted.set(t, (counted.get(t) ?? 0) + 1);
        }
        const repeated = [...counted.entries()].filter(([, n]) => n > 1);
        expect(
          repeated,
          `${actor.name} was shown an event more than once in list ${i + 1}`,
        ).toEqual([]);
      }

      await page.context().clearCookies();
    }
  });

  test('an event built over a long run still renders', async ({ page, baseURL }) => {
    // The most-worked-on event: the one most likely to have accumulated a shape
    // nothing anticipated.
    const busiest = [...handle.events].sort((a, b) => b.volunteerCount - a.volunteerCount)[0];
    test.skip(!busiest, 'the journey created no events');

    const owner = handle.actors.find((a) => a.name === busiest.owner) ?? handle.actors[0];
    const counts = countApiCalls(page);
    await signInAs(page, baseURL, owner);

    await page.goto(`/?event=${busiest.id}`);
    await ready(page);
    await expect(page.locator('#view-event-table')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(SETTLE_MS);

    // The title the journey last corrected it to, not whatever it was called
    // when it was created.
    await expect(page.getByText(busiest.title, { exact: false }).first()).toBeVisible();

    const [endpoint, calls] = worst(counts);
    expect(calls, `viewing one event called ${endpoint} ${calls} times`)
      .toBeLessThanOrEqual(MAX_CALLS_PER_ENDPOINT);
  });
});
