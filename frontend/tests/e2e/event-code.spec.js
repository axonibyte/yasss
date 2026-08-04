/**
 * Short event codes, from the user's side.
 *
 * The backend proves that a code resolves; these prove the two surfaces that
 * make it worth having — somewhere to read one off, and somewhere to type one
 * in. A code that cannot be entered anywhere is just a shorter URL.
 */
import { test, expect } from '@playwright/test';
import { seed, waitForApp } from './helpers.js';

/**
 * A distinct code per test.
 *
 * The suite is fullyParallel against one shared fake store, and a code is
 * unique by construction on the real server — so two tests using the same one
 * resolve each other's events. Random rather than a counter: each worker
 * imports this module afresh, so a module-level sequence restarts at zero in
 * every one of them and two workers starting in the same millisecond collide.
 *
 * Drawn from the app's own alphabet, so there is no I, L, O or U to fold.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ';
const uniqueCode = () => Array.from(
  { length: 8 },
  () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
).join('');

test('the share modal shows the code, and says case does not matter',
  async ({ page, request }) => {
    const code = uniqueCode();
    const { eventId } = await seed(request, {
      event: { activities: 1, windows: 1, code },
    });

    await page.goto(`/?event=${eventId}&share`);
    await waitForApp(page);

    const shown = page.locator('[data-testid="event-code"]');
    await expect(shown).toBeVisible();
    // Hyphenated for reading; the hyphen is presentation only.
    await expect(shown).toHaveValue(`${code.slice(0, 4)}-${code.slice(4)}`);
    await expect(page.locator('.modal-card')).toContainText(/case and punctuation/i);
  });

test.describe('the code entry box', () => {
  test('takes a code and opens the event', async ({ page, request }) => {
    const code = uniqueCode();
    const { eventId } = await seed(request, {
      event: { activities: 1, windows: 1, title: 'Found By Code', code },
    });

    await page.goto('/');
    await waitForApp(page);

    // Spelled the way somebody would after reading it off a flyer.
    await page.locator('#event-code-entry')
      .fill(`${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()}`);
    await page.getByRole('button', { name: 'Go' }).click();

    await expect(page).toHaveURL(new RegExp(`\\\\?event=`));
    await expect(page.getByRole('heading', { name: 'Found By Code' })).toBeVisible();
    expect(eventId).toBeTruthy();
  });

  test('submits on Enter', async ({ page, request }) => {
    // The box is a real <form>, which most of the app still is not.
    const code = uniqueCode();
    await seed(request, {
      event: { activities: 1, windows: 1, title: 'Enter Works', code },
    });

    await page.goto('/');
    await waitForApp(page);
    await page.locator('#event-code-entry').fill(`${code.slice(0, 4)}-${code.slice(4)}`);
    await page.locator('#event-code-entry').press('Enter');

    await expect(page.getByRole('heading', { name: 'Enter Works' })).toBeVisible();
  });

  test('says why a malformed code is malformed, without a round trip',
    async ({ page }) => {
      await page.goto('/');
      await waitForApp(page);

      const requests = [];
      page.on('request', (r) => { if (r.url().includes('/v1/events/')) requests.push(r.url()); });

      await page.locator('#event-code-entry').fill('nope');
      await page.getByRole('button', { name: 'Go' }).click();

      await expect(page.locator('#event-code-entry-error')).toBeVisible();
      await expect(page.locator('#event-code-entry-error')).toContainText('eight characters');
      // Answered locally: "event not found" after a round trip would be a worse
      // message for something the client can see is not a code at all.
      expect(requests).toEqual([]);
    });

  test('clears the error as soon as the code is corrected', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    await page.locator('#event-code-entry').fill('nope');
    await page.getByRole('button', { name: 'Go' }).click();
    await expect(page.locator('#event-code-entry-error')).toBeVisible();

    await page.locator('#event-code-entry').fill('ABCD-EFGH');
    await expect(page.locator('#event-code-entry-error')).toHaveCount(0);
  });
});
