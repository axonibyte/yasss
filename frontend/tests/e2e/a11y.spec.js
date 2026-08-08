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
