/**
 * Accessibility.
 *
 * Two kinds of test live here. The first block pins the specific defect that
 * made every other locator in the live suite work around it: `Field` used to
 * append an "Error" pill as a `<button>` *inside* the `<label>`, which is
 * invalid HTML, added a tab stop that existed only while a field was invalid,
 * and renamed the field from "Event Title" to "Event Title Error" the moment it
 * failed validation. The rest is an axe sweep of the surfaces a user actually
 * spends time on, in both their clean and their error states — the error states
 * matter because that is when the most markup appears and the least of it is
 * exercised by hand.
 *
 * The sweep fails only on serious and critical findings; see `a11y.js` for why.
 */
import { test, expect } from '@playwright/test';
import { seed, seedSignedIn, waitForApp } from './helpers.js';
import { expectAccessible } from './a11y.js';

const MODAL = '.modal-card';

async function openWizard(page) {
  await page.goto('/');
  await waitForApp(page);
  await page.getByRole('link', { name: 'Create Event' }).click();
}

// --- the Field regression ---------------------------------------------------

test.describe('a field in its error state', () => {
  test('keeps its accessible name', async ({ page }) => {
    await openWizard(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#event-title-error')).toBeVisible();

    // The assertion that used to fail: the pill inside the label made this
    // "Event Title Error".
    await expect(page.getByLabel('Event Title', { exact: true })).toBeVisible();
  });

  test('adds no interactive content to any label', async ({ page }) => {
    await openWizard(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#event-title-error')).toBeVisible();

    // A `<button>` inside a `<label>` is invalid HTML: the browser repairs it,
    // and clicking the pill activated the label rather than doing nothing.
    await expect(page.locator('label.label button')).toHaveCount(0);
  });

  test('does not insert a tab stop before the input', async ({ page }) => {
    await openWizard(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#event-title-error')).toBeVisible();

    // This is the one that actually proves it. Before the fix, one Tab from the
    // title landed on the Error pill — a focus order that changed depending on
    // whether the form was valid.
    await page.locator('#event-title').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#event-description')).toBeFocused();
  });

  test('points the input at its message, and stops when corrected', async ({ page }) => {
    await openWizard(page);
    await page.getByRole('button', { name: 'Save' }).click();

    const title = page.locator('#event-title');
    await expect(title).toHaveAttribute('aria-describedby', 'event-title-error');
    await expect(title).toHaveAttribute('aria-invalid', 'true');

    // An `aria-describedby` pointing at an element that is no longer in the DOM
    // is worse than none at all.
    await title.fill('Bake Sale');
    await expect(title).not.toHaveAttribute('aria-invalid', 'true');
  });
});

// --- the sweep --------------------------------------------------------------

test.describe('axe', () => {
  test('the intro page', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await expectAccessible(page);
  });

  test('an event grid', async ({ page, request }) => {
    const { eventId } = await seed(request, { event: { activities: 3, windows: 2 } });
    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);
    await expectAccessible(page);
  });

  /**
   * The poll surfaces, which had no sweep at all while the event ones had six.
   *
   * They are not the event grid with different words: the column headers carry
   * an interactive checkbox inside the tile, which is a shape nothing else in
   * the app has, and the results panel is a table of `progress` elements whose
   * meaning is carried by colour unless something else says it too.
   */
  async function buildPoll(page) {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Create Poll' }).click();
    await page.getByLabel('Poll title').fill('Accessible Poll');
    await page.getByRole('button', { name: 'Monday' }).click();
    await page.getByRole('button', { name: 'Wednesday' }).click();
    await page.getByRole('button', { name: 'Start building' }).click();
    await page.getByRole('button', { name: 'Add a Time' }).click();
    await page.getByLabel('Starts at').fill('09:00');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.modal.is-active')).toHaveCount(0);
  }

  /**
   * The event's own build surface, which had no sweep either -- 'an event grid'
   * above views a published event as a visitor, so the editing controls it
   * grows were never in a sweep. Added alongside the poll one because the two
   * share a button class, and a finding on one that is really a finding on both
   * should say so.
   */
  test('an event being built', async ({ page }) => {
    await openWizard(page);
    await page.getByLabel('Event Title').fill('Accessible Event');
    await page.getByRole('button', { name: 'Save' }).click();
    await expectAccessible(page);
  });

  test('a poll being built', async ({ page }) => {
    await buildPoll(page);
    await expectAccessible(page);
  });

  test('a published poll, answered, with its results on screen', async ({ page }) => {
    await buildPoll(page);
    await page.getByRole('button', { name: 'Publish Poll' }).click();
    await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
    await page.getByRole('button', { name: 'close' }).click();

    await page.locator('[data-slot-state="available"]').first().click();
    await page.getByRole('button', { name: 'Answer This Poll' }).click();
    await page.getByLabel('Your name').fill('Ada');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('poll-results')).toBeVisible();

    await expectAccessible(page);
  });

  test('an event grid on a phone', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { eventId } = await seed(request, { event: { activities: 4, windows: 2 } });
    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);
    await expectAccessible(page);
  });

  test('the dashboard, signed in', async ({ page, request }) => {
    await seedSignedIn(page, request, { event: { activities: 1, windows: 1 } });
    await page.goto('/');
    await waitForApp(page);
    await expectAccessible(page);
  });

  test('the summary modal, clean and in error', async ({ page }) => {
    await openWizard(page);
    await expectAccessible(page, { include: MODAL });

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#event-title-error')).toBeVisible();
    await expectAccessible(page, { include: MODAL });
  });

  test('the auth modal, in both modes and in error', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Log In' }).click();
    await expectAccessible(page, { include: MODAL });

    await page.locator('label[for="auth-new-account"]').click();
    await expectAccessible(page, { include: MODAL });

    await page.locator('#auth-email').fill('not-an-address');
    await page.getByRole('button', { name: 'Register!' }).click();
    await expect(page.locator('#auth-email-error')).toBeVisible();
    await expectAccessible(page, { include: MODAL });
  });

  test('the navbar with its mobile menu open', async ({ page }) => {
    // Both new controls at once, and in the state where they overlap the page:
    // the burger is only rendered below the tablet breakpoint, and the theme
    // toggle only shows its label there.
    await page.setViewportSize({ width: 412, height: 800 });
    await page.goto('/');
    await waitForApp(page);
    await page.getByTestId('navbar-burger').click();
    await expect(page.getByRole('link', { name: 'Create Event' })).toBeVisible();
    await expectAccessible(page);
  });

  test('the tutorial panel, which is not a modal', async ({ page }) => {
    // Deliberately non-modal, so axe sees it alongside a live page rather than
    // behind a scrim -- which is the arrangement worth checking.
    await page.goto('/?tutorial=volunteer');
    await waitForApp(page);
    await expect(page.getByTestId('tutorial-step')).toBeVisible();
    await expectAccessible(page);
  });

  test('the volunteer modal, clean and in error', async ({ page, request }) => {
    const { eventId } = await seed(request, {
      event: { activities: 1, windows: 1, details: [{ type: 'STRING', label: 'Notes', required: true }] },
    });
    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);
    await page.getByRole('button', { name: 'Add Volunteer' }).click();
    const guest = page.getByRole('button', { name: "No thanks, I'm good!" });
    if (await guest.count()) await guest.click();
    await expectAccessible(page, { include: MODAL });

    await page.getByRole('button', { name: 'Save Volunteer' }).click();
    await expect(page.locator('p.help.is-danger').first()).toBeVisible();
    await expectAccessible(page, { include: MODAL });
  });

  test('the activity modal, with the cap field showing', async ({ page }) => {
    await openWizard(page);
    await page.locator('#event-title').fill('Bake Sale');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Add an Activity' }).click();
    await expectAccessible(page, { include: MODAL });

    // The cap inputs only render once "unlimited" is off, so the clean scan
    // above never sees them.
    await page.locator('label[for="activity-slot-cap-unlimited"]').click();
    await expectAccessible(page, { include: MODAL });
  });
});
