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

  await expect(page.getByTestId('tutorial-track-organiser')).toBeVisible();
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
for (const track of ['organiser', 'volunteer']) {
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
      expect(steps.length).toBeGreaterThan(3);
      // Each step said something different; a tour that renders the same panel
      // every time would otherwise pass everything above.
      expect(new Set(steps).size).toBe(steps.length);

      // The claim.
      expect(calls, `the tutorial called the API: ${calls.join(', ')}`).toEqual([]);
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
  expect(calls, `the tutorial called the API: ${calls.join(', ')}`).toEqual([]);

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
  await startTutorial(page, 'organiser');
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

test('a signed-in organiser is warned before losing real work', async ({ page, request }) => {
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
