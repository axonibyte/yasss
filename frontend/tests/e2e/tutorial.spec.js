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
import {
  PRACTICE_POLL_TITLE, PRACTICE_TITLE, PRACTICE_VOLUNTEER,
} from '../../src/lib/tutorial/markers.js';

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

/**
 * Which of the chooser's two questions each track sits behind.
 *
 * Duplicated from TRACKS rather than imported, deliberately: this suite drives
 * the real UI, and a map derived from the same source it is checking would
 * agree with itself no matter what the buttons actually said.
 */
const GROUP_OF = {
  poll: 'organizing',
  organizer: 'organizing',
  voter: 'participant',
  volunteer: 'participant',
};

/** Open the tutorial from the landing page and pick a track, two clicks deep. */
async function startTutorial(page, track) {
  await page.getByTestId('tutorial-start').click();
  await page.getByTestId(`tutorial-group-${GROUP_OF[track]}`).click();
  await page.getByTestId(`tutorial-track-${track}`).click();
  await expect(page.getByTestId('tutorial-step')).toBeVisible();
}

/** Walk to the end, returning the text of every step seen. */
async function walkToEnd(page) {
  const seen = [];
  for (let i = 0; i < 60; i += 1) {
    seen.push(await page.getByTestId('tutorial-step').innerText());
    const next = page.getByRole('button', { name: 'Next' });
    if (await next.count() === 0) break;
    await next.click();
  }
  return seen;
}

/**
 * Step forward until something is on screen, or give up.
 *
 * The creation tracks open on the landing page -- that is where "Create Poll"
 * is -- and build the practice model as they go, so nothing about the grid is
 * true at step one any more. Tests that want the grid have to walk to it, and
 * walking by *condition* rather than by a step count means they survive a step
 * being inserted, which is the whole reason the tour is a list and not a
 * switch statement.
 */
async function advanceUntil(page, locator, limit = 20) {
  for (let i = 0; i < limit; i += 1) {
    if (await locator.count() > 0 && await locator.first().isVisible()) return true;
    const next = page.getByRole('button', { name: 'Next' });
    if (await next.count() === 0) break;
    await next.click();
  }
  return await locator.count() > 0 && await locator.first().isVisible();
}

test('the chooser asks which side you are on before which tour', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.getByTestId('tutorial-start').click();

  // First question: organizing or attending. The tracks themselves are not on
  // screen yet -- that is the whole point of splitting the question.
  await expect(page.getByTestId('tutorial-group-organizing')).toBeVisible();
  await expect(page.getByTestId('tutorial-group-participant')).toBeVisible();
  await expect(page.getByTestId('tutorial-track-organizer')).toHaveCount(0);
  await expect(page.getByTestId('tutorial-track-volunteer')).toHaveCount(0);

  // Second question, and only the two that belong to the chosen side.
  await page.getByTestId('tutorial-group-organizing').click();
  await expect(page.getByTestId('tutorial-track-poll')).toBeVisible();
  await expect(page.getByTestId('tutorial-track-organizer')).toBeVisible();
  await expect(page.getByTestId('tutorial-track-volunteer')).toHaveCount(0);

  // Nothing has begun yet: the panel appears only once a track is chosen.
  await expect(page.getByTestId('tutorial-step')).toHaveCount(0);

  // Answering the first question wrongly is recoverable without losing the modal.
  await page.getByTestId('tutorial-back').click();
  await page.getByTestId('tutorial-group-participant').click();
  await expect(page.getByTestId('tutorial-track-voter')).toBeVisible();
  await expect(page.getByTestId('tutorial-track-volunteer')).toBeVisible();
  await expect(page.getByTestId('tutorial-track-poll')).toHaveCount(0);
});

/** A link to a track that has since been absorbed still starts a tour. */
test('a retired track name still opens the tour that absorbed it', async ({ page }) => {
  await page.goto('/?tutorial=builder');
  await waitForApp(page);

  await expect(page.getByTestId('tutorial-step')).toBeVisible();
  // The organizer track, not the chooser.
  await expect(page.getByTestId('tutorial-group-organizing')).toHaveCount(0);
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
for (const track of ['organizer', 'volunteer', 'poll', 'voter']) {
  test(`the ${track} track steps from end to end without fetching anything`,
    async ({ page }) => {
      const calls = await watchRequests(page);
      await page.goto('/');
      await waitForApp(page);

      // Whatever the boot sequence did is not what this test is about.
      calls.length = 0;

      await startTutorial(page, track);

      const steps = await walkToEnd(page);

      // Two of these tracks teach on the practice poll and two on the practice
      // event, and they render different headings. Asserting the event's for all
      // four would fail the poll tracks for the wrong reason.
      //
      // Asserted at the end rather than the start: the creation tracks begin on
      // the landing page, because the first thing they teach is where the
      // button is. By the last step every track is standing on its own
      // published practice model.
      const poll = ['poll', 'voter'].includes(track);
      await expect(page.getByTestId(poll ? 'poll-title' : 'event-title'))
        .toHaveText(poll ? PRACTICE_POLL_TITLE : PRACTICE_TITLE);
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
  // Far enough in that there is a practice event on screen to be got rid of --
  // which is the thing this test is about.
  expect(await advanceUntil(page, page.getByTestId('event-title'))).toBe(true);

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
    // The activities arrive when the step about activities runs, so the slider
    // arrives with them rather than at step one.
    expect(await advanceUntil(page, slider)).toBe(true);
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
      expect(await advanceUntil(page, slider)).toBe(true);

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

/**
 * What the tour shows, rather than what it says.
 *
 * These are the regression tests for the rewrite. The old poll track described
 * a creation flow over a finished poll: the step about repeating a time named
 * controls that live in a dialog the tour never opened, and the step about
 * columns highlighted the whole table -- time axis and blank corner included --
 * because the highlighter only ever marked one element.
 *
 * Each test here fails if any part of that comes back.
 */
test.describe('the creation tracks build rather than describe', () => {
  test('opens the real settings form and points inside it', async ({ page }) => {
    await page.goto('/?tutorial=poll');
    await waitForApp(page);

    // Step one is the landing page, because that is where the button is.
    await expect(page.getByTestId('nav-create-poll')).toBeVisible();
    await expect(page.getByTestId('poll-title')).toHaveCount(0);

    const scope = page.locator('[data-field="poll-scope"]');
    expect(await advanceUntil(page, scope)).toBe(true);

    // The real dialog, not a description of one -- and filled in, because an
    // empty form teaches nothing about the choice being described.
    await expect(page.locator('.modal.is-active')).toBeVisible();
    await expect(scope).toHaveClass(/tutorial-anchor/);
    await expect(page.locator('[data-testid="day-picker"] button[aria-pressed="true"]'))
      .not.toHaveCount(0);
  });

  test('opens the time form with the repeat already on', async ({ page }) => {
    await page.goto('/?tutorial=poll');
    await waitForApp(page);

    const until = page.locator('[data-field="poll-repeat-until"]');
    expect(await advanceUntil(page, until, 30)).toBe(true);

    // "Until" and the interval only exist while Repeat is ticked. The old track
    // described both from a surface where neither was rendered.
    await expect(page.locator('#poll-repeat')).toBeChecked();
    await expect(page.locator('[data-field="poll-repeat-every"]')).toBeVisible();
    // And the form's own preview of what that produces is on screen while the
    // copy explains it.
    await expect(page.getByTestId('repeat-preview')).toBeVisible();
  });

  test('boxes each day column, not the table', async ({ page }) => {
    await page.goto('/?tutorial=poll');
    await waitForApp(page);

    const table = page.locator('#view-poll-table');
    expect(await advanceUntil(page, table, 30)).toBe(true);

    // Walk on to the step that is actually about the columns.
    for (let i = 0; i < 6; i += 1) {
      if (await page.locator('#view-poll-table [data-col].tutorial-anchor').count() > 0) break;
      await page.getByRole('button', { name: 'Next' }).click();
    }

    const marked = page.locator('.tutorial-anchor');
    await expect(marked).not.toHaveCount(0);
    // Several, one per column -- the whole point of the change.
    expect(await marked.count()).toBeGreaterThan(1);
    // And never the table itself, which is what boxed the time axis in with the
    // days.
    await expect(table).not.toHaveClass(/tutorial-anchor/);
    for (const el of await marked.all()) {
      await expect(el).toHaveAttribute('data-col', /\d+/);
    }
  });

  test('keeps its own controls reachable above the dialog it opened',
    async ({ page }) => {
      await page.goto('/?tutorial=poll');
      await waitForApp(page);
      expect(await advanceUntil(page, page.locator('[data-field="poll-scope"]'))).toBe(true);
      await expect(page.locator('.modal.is-active')).toBeVisible();

      // Bulma puts a modal at z-index 40 and the panel sat at 30, so without the
      // override the tour's only exit is underneath the dialog it just opened.
      const next = page.getByRole('button', { name: 'Next' });
      const onTop = await next.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return el === hit || el.contains(hit);
      });
      expect(onTop, 'the tutorial panel is buried under its own dialog').toBe(true);

      // And it works: pressing it advances rather than hitting the backdrop.
      const before = await page.getByTestId('tutorial-position').innerText();
      await next.click();
      await expect(page.getByTestId('tutorial-position')).not.toHaveText(before);
    });

  test('never leaves the sandbox, even if the learner uses the navbar',
    async ({ page }) => {
      // `reset()` clears the sandbox flag, and "Create Poll" resets. Without
      // the guard in `savePollSummaryModal` a learner who pressed it mid-tour
      // would be building a real poll inside the tutorial and publishing it for
      // real at the end.
      const calls = await watchRequests(page);
      await page.goto('/?tutorial=poll');
      await waitForApp(page);
      calls.length = 0;

      await page.getByTestId('nav-create-poll').click();
      await page.getByLabel('Poll title').fill('Escaped the sandbox');
      // The day buttons are named by their `aria-label`, which is the long form.
      await page.getByRole('button', { name: 'Monday' }).click();
      await page.getByRole('button', { name: 'Start building' }).click();

      await page.getByTestId('publish-poll').click();
      await expect(
        page.getByText('This is a practice poll, so it is not published anywhere.'),
      ).toBeVisible();
      await page.waitForTimeout(500);
      expect(leaks(calls), `the tutorial wrote to the API: ${leaks(calls).join(', ')}`)
        .toEqual([]);
      expect(calls.filter((c) => c.includes('/v1/polls'))).toEqual([]);
    });
});
