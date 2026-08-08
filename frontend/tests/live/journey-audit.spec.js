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
import { parseDeck } from '../../src/lib/tutorial/deck.js';
import { DEFAULT_COPY } from '../../src/lib/tutorial/defaults.js';
import { PRACTICE_TITLE } from '../../src/lib/tutorial/markers.js';
import { SUBMIT_RSVPS } from '../shared/labels.js';

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

/**
 * The tutorial, run against the real stack by somebody who has real events.
 *
 * Two things this tier can see that `tests/e2e/tutorial.spec.js` cannot. It runs
 * as an actor who has *accumulated* something -- a world of events built by
 * hundreds of prior actions -- so a tour that clobbers state has something to
 * clobber. And it runs against the real server with the operator's real deck,
 * where the fake answers `/v1/texts/:id` with the same generic markdown for
 * every id and so cannot tell a deck being read from one being ignored.
 *
 * The absence half of the claim -- that nothing reached the server -- is checked
 * from the server's side afterwards by `e2e/journeys/verify-sandbox.mjs`. This
 * side counts requests; that side asks the database. Neither is sufficient
 * alone, which is why there are two.
 */
describe('the tutorial, over an accumulated world', () => {
  /** The deck the operator actually configured, parsed the way the app parses it. */
  let deck = null;

  test.beforeAll(async ({ request }) => {
    const res = await request.get('/v1/texts/tutorial');
    deck = res.ok() ? parseDeck(await res.text()) : {};
  });

  test('runs both tracks without writing anything', async ({ page, baseURL }) => {
    const actor = handle.actors[0];
    test.skip(!actor, 'no actor with an account in this world');

    for (const track of ['organizer', 'volunteer']) {
      const counts = countApiCalls(page);
      await signInAs(page, baseURL, actor);
      await page.goto(`/?tutorial=${track}`);
      await ready(page);

      await expect(page.getByTestId('event-title')).toHaveText(PRACTICE_TITLE);

      // Discard the boot traffic. A signed-in visitor's page legitimately lists
      // their own events before anything tutorial-shaped happens -- that is the
      // dashboard doing its job, and counting it would make this assertion
      // about being signed in rather than about the tutorial. What is asserted
      // is what the *tour* does from here.
      counts.clear();

      // Walk it, and *do the things it describes*.
      //
      // Claiming a tile is not enough on its own and it took a mutation run to
      // notice: an unclaimed tile belongs to an unpersisted volunteer, and that
      // toggle is local whether or not the sandbox clause exists. The write
      // that clause prevents happens at submit. A version of this test that
      // only clicked tiles passed with the clause deleted -- it was watching
      // for a request that the tutorial had no reason to make either way.
      let submitted = false;
      for (let i = 0; i < 40; i += 1) {
        const tile = page.locator('.event-cell li').filter({ hasText: /^Available$/ }).first();
        if (await tile.count() > 0) await tile.click().catch(() => {});

        const submit = page.getByRole('button', { name: SUBMIT_RSVPS });
        if (await submit.count() > 0 && await submit.isEnabled().catch(() => false)) {
          await submit.click();
          submitted = true;
        }

        const next = page.getByRole('button', { name: 'Next' });
        if (await next.count() === 0) break;
        await next.click();
      }
      await page.waitForTimeout(SETTLE_MS);

      // The volunteer track hands the learner somebody to be and a button to
      // press, so a run of it that submitted nothing exercised nothing.
      if (track === 'volunteer') {
        expect(submitted, 'the volunteer tour never reached an enabled Submit').toBe(true);
      }

      // Writes of any kind, and any traffic about events at all. The deck is a
      // public GET of /v1/texts and is allowed; see tests/e2e/tutorial.spec.js
      // for why the assertion is this shape and not "no requests".
      const forbidden = [...counts.keys()].filter(
        (k) => !k.startsWith('GET ') || k.includes('/v1/events'),
      );
      expect(
        forbidden,
        `the ${track} tutorial talked to the server about events: ${forbidden.join(', ')}`,
      ).toEqual([]);

      await page.getByRole('button', { name: /Finish|Exit tutorial/ }).first().click();
      await page.context().clearCookies();
    }
  });

  test('shows the operator\'s words, not the built-in ones', async ({ page }) => {
    const [id, markdown] = Object.entries(deck ?? {})
      .find(([k]) => k === 'v-welcome' || k === 'welcome') ?? [];
    test.skip(!id, 'the deployed deck covers neither opening step');

    const track = id === 'welcome' ? 'organizer' : 'volunteer';
    await page.goto(`/?tutorial=${track}`);
    await ready(page);

    const step = page.getByTestId('tutorial-step');
    // A distinctive line from the deck, and the absence of the default it
    // replaced. Both halves matter: showing the deck's words proves the file is
    // read, and the default being gone proves it actually replaced them rather
    // than being appended somewhere nobody looks.
    const firstLine = markdown.split('\n').find((l) => l.trim() && !l.startsWith('#'));
    await expect(step).toContainText(firstLine.trim().slice(0, 40));
    const defaultFirstLine = DEFAULT_COPY[id].split('\n')
      .find((l) => l.trim() && !l.startsWith('#'));
    await expect(step).not.toContainText(defaultFirstLine.trim().slice(0, 40));
  });

  test('leaves an interrupted actor\'s own world exactly as it was', async ({ page, baseURL }) => {
    const actor = handle.actors[0];
    const expected = handle.expectedListings.find((e) => e.name === actor?.name);
    test.skip(!expected || expected.owned.length === 0, 'this actor owns nothing to disturb');

    await signInAs(page, baseURL, actor);
    await page.goto('/');
    await ready(page);
    const before = await page.locator('#list-event-section li').count();

    // Interrupted mid-session, which is the case that only exists once somebody
    // has accumulated something worth losing.
    await page.getByRole('link', { name: 'Tutorial' }).click();
    await page.getByTestId('tutorial-track-volunteer').click();
    await expect(page.getByTestId('event-title')).toHaveText(PRACTICE_TITLE);
    await page.getByRole('button', { name: 'Exit tutorial' }).click();

    await ready(page);
    await page.waitForTimeout(SETTLE_MS);
    await expect(page.getByTestId('tutorial-step')).toHaveCount(0);
    expect(
      await page.locator('#list-event-section li').count(),
      'the dashboard changed across a tutorial run',
    ).toBe(before);
  });
});
