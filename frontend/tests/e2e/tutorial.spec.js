/**
 * The guided tutorial, and the one claim it has to keep.
 *
 * The practice event carries an id so the volunteer surface renders, and an id
 * is what every write in `state/actions/` gates on. So the interesting
 * assertion here is not that the tour advances -- it is that a learner can
 * click every tile, add a volunteer and press Submit, and *nothing leaves the
 * page*. `state/actions/remote.js` is the single clause that makes that true,
 * and this is what notices when it stops being.
 *
 * The seeded journeys check the same claim from the other side, against a real
 * server and other actors' listings. Two oracles, because a leak that only one
 * of them can see is a leak that ships.
 */
import { test, expect } from '@playwright/test';
import { seed, signIn, waitForApp } from './helpers.js';
import { SUBMIT_RSVPS } from '../shared/labels.js';
import { PRACTICE_TITLE, PRACTICE_VOLUNTEER } from '../../src/lib/tutorial/markers.js';

/**
 * Record every request the page makes, so a test can ask what it did.
 *
 * Installed before `goto`, and counting requests rather than intercepting them:
 * the point is to observe the real app, not a version of it that had its API
 * taken away.
 */
async function watchRequests(page) {
  const calls = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/v1/')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

/**
 * The calls a practice event must never make.
 *
 * Not "no requests at all": the tour legitimately fetches the operator's copy
 * deck, and a test that forbade every call would have to be relaxed the first
 * time anything public was read -- which is how an assertion stops meaning
 * anything. The claim is narrower and permanent:
 *
 *   - nothing is *written*, by anyone, ever;
 *   - nothing touches `/v1/events`, read or write, because the practice event
 *     has an id the server has never heard of and no business being asked
 *     about.
 *
 * A public GET of `/v1/texts/tutorial` satisfies both, and is the one call the
 * tour is supposed to make.
 */
const leaks = (calls) => calls.filter(
  (c) => !c.startsWith('GET ') || c.includes('/v1/events'),
);

/** Open the tutorial from the landing page and pick a track. */
async function startTutorial(page, track) {
  await page.getByTestId('tutorial-start').click();
  await page.getByTestId(`tutorial-track-${track}`).click();
  await expect(page.getByTestId('tutorial-step')).toBeVisible();
}

/** Walk to the end, returning the text of every step seen. */
async function walkToEnd(page) {
  const seen = [];
  for (let i = 0; i < 40; i += 1) {
    seen.push(await page.getByTestId('tutorial-step').innerText());
    const next = page.getByRole('button', { name: 'Next' });
    if (await next.count() === 0) break;
    await next.click();
  }
  return seen;
}

test('the chooser offers both tracks and starts neither on its own', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.getByTestId('tutorial-start').click();

  await expect(page.getByTestId('tutorial-track-organizer')).toBeVisible();
  await expect(page.getByTestId('tutorial-track-volunteer')).toBeVisible();
  // Nothing has begun yet: the panel appears only once a track is chosen.
  await expect(page.getByTestId('tutorial-step')).toHaveCount(0);
});

/**
 * Stepping through is passive.
 *
 * Narrower than it looks, and deliberately named for what it proves: walking
 * the tour touches nothing, so a step that re-fetched the event or reloaded a
 * listing would show up here. It does *not* prove containment -- these tests
 * click nothing, and would pass with the sandbox clause deleted. That claim is
 * the next test's, which is the one to look at when this file is edited.
 */
for (const track of ['organizer', 'volunteer']) {
  test(`the ${track} track steps from end to end without fetching anything`,
    async ({ page }) => {
      const calls = await watchRequests(page);
      await page.goto('/');
      await waitForApp(page);

      // Whatever the boot sequence did is not what this test is about.
      calls.length = 0;

      await startTutorial(page, track);
      await expect(page.getByTestId('event-title')).toHaveText(PRACTICE_TITLE);

      const steps = await walkToEnd(page);
      // The one call the tour is allowed: the operator's copy deck, once.
      expect(calls.filter((c) => c.includes('/v1/texts/tutorial'))).toHaveLength(1);
      expect(steps.length).toBeGreaterThan(3);
      // Each step said something different; a tour that renders the same panel
      // every time would otherwise pass everything above.
      expect(new Set(steps).size).toBe(steps.length);

      // The claim.
      expect(leaks(calls), `the tutorial wrote to the API: ${leaks(calls).join(', ')}`)
        .toEqual([]);
    });
}

/**
 * The claim the whole feature rests on.
 *
 * The practice event carries an id, and an id is what every write in
 * `state/actions/` gates on -- so without the sandbox clause in `remote.js`
 * this submit becomes a real POST against an event id the server has never
 * heard of. Delete that clause and this test is what says so.
 */
test('claiming tiles and submitting stays in the browser', async ({ page }) => {
  const calls = await watchRequests(page);
  await page.goto('/');
  await waitForApp(page);
  calls.length = 0;

  await startTutorial(page, 'volunteer');

  // Step forward until the tour has given us a volunteer to be.
  //
  // Waiting on the name rather than on an `<option>` existing: the empty state
  // renders a disabled "Add a volunteer!" placeholder, so counting options says
  // "yes" before anything has been added.
  const panel = page.locator('#view-event-volunteer');
  for (let i = 0; i < 6; i += 1) {
    if ((await panel.innerText()).includes(PRACTICE_VOLUNTEER)) break;
    await page.getByRole('button', { name: 'Next' }).click();
  }
  await expect(panel).toContainText(PRACTICE_VOLUNTEER);

  // Claim a tile for real, through the same handler the live app uses.
  const available = page.locator('.event-cell li').filter({ hasText: /^Available$/ }).first();
  await available.click();
  await expect(page.locator('.event-cell li').filter({ hasText: /^Booked$/ })).toHaveCount(1);

  // And submit it. The button is the real one, gated on the real pending count.
  const submit = page.getByRole('button', { name: SUBMIT_RSVPS });
  await expect(submit).toBeEnabled();
  await submit.click();

  // Settle before asserting, and assert the requests *before* the toast.
  //
  // Both orderings catch a leak; only this one says what happened. Waiting on
  // the toast first means a leak presents as "the success toast never
  // appeared" thirty seconds later -- true, unhelpful, and several inferences
  // away from the deleted clause that caused it. Proving an absence needs time
  // to pass, hence the wait.
  await page.waitForTimeout(1000);
  expect(leaks(calls), `the tutorial wrote to the API: ${leaks(calls).join(', ')}`)
        .toEqual([]);

  await expect(page.getByText('RSVP successfully submitted!')).toBeVisible();
});

test('the practice event does not arm the unload guard', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startTutorial(page, 'volunteer');

  // A local event with a title normally counts as unsaved work. This one is
  // going nowhere, so nagging about losing it would teach a first-time visitor
  // that the app nags.
  const armed = await page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(armed).toBe(false);
});

test('exiting puts the visitor back where they started', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startTutorial(page, 'organizer');
  await expect(page.getByTestId('event-title')).toBeVisible();

  await page.getByRole('button', { name: 'Exit tutorial' }).click();

  await expect(page.getByTestId('tutorial-step')).toHaveCount(0);
  await expect(page.getByTestId('event-title')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create an Event!' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('the panel does not trap focus, because the learner has to click the page',
  async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await startTutorial(page, 'volunteer');

    // The whole method is "click the thing being described". Every other
    // overlay in this app traps focus; this one must not.
    const cell = page.locator('.event-cell li').filter({ hasText: /^Available$/ }).first();
    await cell.focus();
    await expect(cell.locator('..')).toBeVisible();
    const inPanel = await page.evaluate(
      () => Boolean(document.activeElement?.closest('#tutorial-panel')),
    );
    expect(inPanel).toBe(false);
  });

test('a signed-in organizer is warned before losing real work', async ({ page, request }) => {
  const { user, session } = await seed(request, { user: {} });
  await signIn(page, { user, session });
  await page.goto('/');
  await waitForApp(page);

  // Build something real and unsaved, the way the navbar item can be reached
  // from mid-wizard.
  await page.getByRole('link', { name: 'Create Event' }).click();
  await page.getByLabel('Event Title').fill('A real event I am mid-way through');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('link', { name: 'Tutorial' }).click();
  await expect(page.getByText('You have unsaved work on this event')).toBeVisible();

  // Backing out leaves the real event exactly where it was.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('event-title'))
    .toHaveText('A real event I am mid-way through');
});

/**
 * The operator's deck, and the failure nobody notices.
 *
 * The fake answers `/v1/texts/:id` with generic markdown for any id, so the
 * default path is already exercised by every test above. These cover the other
 * direction: a configured deck must actually win. A tutorial that quietly
 * ignores the file passes every containment check ever written, and the first
 * report of it is an operator asking why their edit did nothing.
 */
test.describe('the copy deck', () => {
  const DECK = `<!-- yasss:tutorial v1 -->
<!-- step: v-welcome -->
## Deck copy for v-welcome
Written by the operator, [with a link](https://example.invalid/x).
`;

  const serveDeck = (page, body) => page.route('**/v1/texts/tutorial', (r) => r.fulfill({
    status: 200, contentType: 'text/markdown', body,
  }));

  test('overrides the built-in copy where it speaks', async ({ page }) => {
    await serveDeck(page, DECK);
    await page.goto('/');
    await waitForApp(page);
    await startTutorial(page, 'volunteer');

    const step = page.getByTestId('tutorial-step');
    await expect(step).toContainText('Deck copy for v-welcome');
    // And the default is gone, not merely also present -- which is what
    // "overrides" has to mean for this test to be worth anything.
    await expect(step).not.toContainText('Somebody sent you a link');
    // Rendered, not printed: a deck wired past the markdown renderer would
    // contain the right words and show them as literal brackets.
    await expect(step.locator('a[href="https://example.invalid/x"]')).toBeVisible();
  });

  test('keeps the built-in copy for a step it says nothing about', async ({ page }) => {
    await serveDeck(page, DECK);
    await page.goto('/');
    await waitForApp(page);
    await startTutorial(page, 'volunteer');

    // The deck covers v-welcome only. Its neighbors must still teach something
    // rather than rendering an empty panel.
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('tutorial-step')).toContainText('Add yourself');
  });

  test('falls back entirely when the deck is unconfigured', async ({ page }) => {
    // Which is the state of every deployment until somebody writes the file:
    // PublicTextEndpoint logs and carries on, so this is the default, not an
    // error.
    await page.route('**/v1/texts/tutorial', (r) => r.fulfill({ status: 404, body: '' }));
    await page.goto('/');
    await waitForApp(page);
    await startTutorial(page, 'volunteer');
    await expect(page.getByTestId('tutorial-step')).toContainText('Somebody sent you a link');
  });
});

/**
 * `?tutorial` is the only entry point that can be sent to somebody, which is the
 * only practical way to reach a volunteer -- they arrive from a shared link and
 * never see the landing page the other two entry points live on.
 */
test.describe('the ?tutorial link', () => {
  test('starts a named track directly', async ({ page }) => {
    await page.goto('/?tutorial=volunteer');
    await waitForApp(page);
    await expect(page.getByTestId('tutorial-step')).toContainText('Somebody sent you a link');
  });

  test('asks which one for a bare link, or an unrecognized track', async ({ page }) => {
    for (const url of ['/?tutorial', '/?tutorial=nonsense']) {
      await page.goto(url);
      await waitForApp(page);
      await expect(page.getByTestId('tutorial-track-organizer')).toBeVisible();
    }
  });

  test('takes itself out of the URL, so exiting does not restart it', async ({ page }) => {
    await page.goto('/?tutorial=organizer');
    await waitForApp(page);
    await expect(page.getByTestId('tutorial-step')).toBeVisible();
    expect(new URL(page.url()).searchParams.has('tutorial')).toBe(false);

    // Exit navigates home; with the parameter still set that would land the
    // visitor straight back in the tutorial they just left.
    await page.getByRole('button', { name: 'Exit tutorial' }).click();
    await expect(page.getByTestId('tutorial-step')).toHaveCount(0);
  });

  test('yields to an event the link also names', async ({ page, request }) => {
    // `?event=...&tutorial` is a link somebody could plausibly build. The event
    // is what they were pointed at; starting a tour over it would be the
    // tutorial overriding the user rather than serving them.
    const { eventId } = await seed(request, {
      event: { activities: 1, windows: 1, title: 'A real event' },
    });
    await page.goto(`/?event=${eventId}&tutorial=organizer`);
    await waitForApp(page);

    await expect(page.getByTestId('event-title')).toHaveText('A real event');
    await expect(page.getByTestId('tutorial-step')).toHaveCount(0);
  });
});

/**
 * The practice event is wider than the grid, on purpose.
 *
 * A tour of a grid that fits would teach a first-time organizer a grid that
 * behaves differently from the one they get the moment they add a fifth
 * activity — and the slider is the only control on the page that reveals
 * content rather than changing it, so it is the one most worth showing.
 */
test.describe('the practice grid pages', () => {
  test('shows a slider, and paging moves the activities', async ({ page }) => {
    await page.goto('/?tutorial=organizer');
    await waitForApp(page);

    const slider = page.locator('#view-event-slider');
    await expect(slider).toBeVisible();
    // Six activities, four visible columns, so the last page starts at three.
    await expect(slider).toHaveAttribute('max', '3');

    const headers = () => page.locator('#view-event-table .fixed-grid > .grid > .cell')
      .filter({ hasNot: page.locator('[data-slot-state]') })
      .allTextContents();

    const first = (await headers()).slice(1, 5);
    expect(first).toContain('Set up');

    await slider.fill('3');
    const last = (await headers()).slice(1, 5);
    expect(last).not.toEqual(first);
    // Still four columns: it pages rather than growing.
    expect(last).toHaveLength(4);
  });

  test('a step teaches it, and puts the grid back to the first page',
    async ({ page }) => {
      await page.goto('/?tutorial=organizer');
      await waitForApp(page);
      const slider = page.locator('#view-event-slider');

      // Wander off before reaching the step that describes paging.
      await slider.fill('3');

      for (let i = 0; i < 20; i += 1) {
        if ((await page.getByTestId('tutorial-step').innerText()).match(/slider/i)) break;
        await page.getByRole('button', { name: 'Next' }).click();
      }
      await expect(page.getByTestId('tutorial-step')).toContainText(/slider/i);
      // Whatever the learner dragged it to, the step describes page one.
      await expect(slider).toHaveValue('1');
    });
});
