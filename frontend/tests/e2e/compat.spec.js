/**
 * The handful of things that genuinely differ between browser engines.
 *
 * The rest of the suite runs on Chromium only, which is the right trade: nearly
 * all of it exercises application logic, and running that three more times buys
 * repetition rather than coverage. What is worth repeating is the small set of
 * places where the *browser* is the variable — and the two hardest bugs found in
 * the previous pass were both of exactly that kind, a Bulma switch whose label
 * covers its input and an imperative calendar that builds its own overlay
 * outside the component tree.
 *
 * Everything here is tagged `@compat`, which is what the firefox, webkit and
 * mobile-chromium projects grep for. Nothing that logs in is tagged: deriving a
 * credential runs scrypt at N=16384 in the browser and would dominate the
 * runtime of every engine for no engine-specific signal.
 *
 * Deliberately nothing from a fuzz loop is tagged either — one such test is
 * thirty-one modal cycles, which is ninety-three across the matrix.
 */
import { test, expect } from '@playwright/test';
import { seed, waitForApp } from './helpers.js';

test.describe('cross-engine', { tag: '@compat' }, () => {
  /**
   * Bulma hides the real checkbox and draws its label on top, so the label is
   * the only thing clickable. Whether that click reaches the input, and whether
   * the resulting `change` fires, is browser behaviour — and every switch in
   * the product, plus `toggleSwitch` in the live harness, depends on it. A
   * silent failure here would make a great many other tests meaningless.
   */
  test('a switch label toggles the input it covers', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Create Event' }).click();
    await page.locator('#event-title').fill('Switches');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Add an Activity' }).click();

    const unlimited = page.locator('#activity-slot-cap-unlimited');
    await expect(unlimited).toBeChecked();

    await page.locator('label[for="activity-slot-cap-unlimited"]').click();
    await expect(unlimited).not.toBeChecked();
    // The cap input renders off the same state, so this proves the change event
    // propagated rather than just the DOM property flipping.
    await expect(page.locator('#activity-slot-cap')).toBeVisible();

    await page.locator('label[for="activity-slot-cap-unlimited"]').click();
    await expect(unlimited).toBeChecked();
  });

  /**
   * bulma-calendar is the last imperative DOM island in the app: it builds its
   * own overlay outside the Svelte tree, positions it from computed styles, and
   * tears it down by id. Saving the picker already needs a forced click in
   * Chromium, which is reason enough to check the others.
   */
  test('the window picker opens, commits a range and tears down cleanly',
    async ({ page }) => {
      await page.goto('/');
      await waitForApp(page);
      await page.getByRole('link', { name: 'Create Event' }).click();
      await page.locator('#event-title').fill('Picker');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('button', { name: 'Add an Activity' }).click();
      await page.locator('#activity-label').fill('Setup');
      await page.getByRole('button', { name: 'Save Activity' }).click();

      await page.getByRole('button', { name: 'Add a Window' }).click();
      await page.getByRole('button', { name: 'Save Window' }).click();

      // The window header cell proves the range committed, and the absence of a
      // leftover overlay proves the island cleaned up after itself — the exact
      // failure that used to throw an uncaught TypeError on every save.
      await expect(page.locator('#view-event-table')).toBeVisible();
      await expect(page.locator('.datetimepicker.is-active')).toHaveCount(0);
    });

  /**
   * Escape is delivered to a window listener while focus sits inside a text
   * input, which WebKit has historically handled differently, and the modal
   * backdrop is a full-screen click target underneath a card.
   */
  test('a modal closes by Escape and by its backdrop', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    await page.getByRole('link', { name: 'Log In' }).click();
    await page.locator('#auth-email').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-card')).toHaveCount(0);

    await page.getByRole('link', { name: 'Log In' }).click();
    // Clicked near the corner: the backdrop spans the viewport but the card
    // sits over its centre, which is where a plain click would land.
    await page.locator('.modal-background').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.modal-card')).toHaveCount(0);
  });

  /**
   * The grid is a matrix, so it holds five columns at every width and scrolls
   * inside its own container. `minmax()` resolution and the fractional rounding
   * of `scrollWidth - clientWidth` both differ between engines; WebKit in
   * particular can leave a pixel or two of document overflow where Chromium
   * leaves none.
   */
  test('the grid scrolls within itself and never the page', async ({ page, request }) => {
    const { eventId } = await seed(request, { event: { activities: 5, windows: 2 } });
    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const cell = page.locator('.event-cell').nth(1);
    expect((await cell.boundingBox()).width).toBeGreaterThan(100);
  });

  /**
   * Window headers come from `toLocaleDateString`, and **WebKit's ICU emits a
   * narrow no-break space (U+202F) before AM/PM where Chromium emits an
   * ordinary one**. Any assertion written as `hasText: '12:00 PM'` therefore
   * passes on Chromium and fails on WebKit for a reason that has nothing to do
   * with the application. This test exists to make that divergence explicit
   * rather than let it surface as a mystery.
   */
  test('window labels carry a time, whichever space the engine uses', async ({ page, request }) => {
    const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });
    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);

    const header = await page.locator('.event-cell').nth(2).innerText();
    // \s covers U+0020 and U+202F alike; the point is that a time is rendered,
    // not which codepoint separates it from the meridiem.
    expect(header).toMatch(/\d{2}\/\d{2}\/\d{2},\s+\d{2}:\d{2}\s+[AP]M/);
  });

  /**
   * Touch targets are deliberately *not* asserted here.
   *
   * The grid's slot buttons measure 18px tall, well under the 44px WCAG 2.5.5
   * asks for. That is a real finding, but it follows from the grid being a
   * matrix that holds five columns at any width — raising the tiles to 44px is
   * a layout decision about the product's central screen, not a test fix. A
   * test asserting the current 18px would pin the defect and one asserting 44px
   * would simply fail, so it is recorded in docs/remaining-work.md instead.
   */
});
