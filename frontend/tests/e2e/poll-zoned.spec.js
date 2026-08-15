/**
 * A poll pinned to somebody else's clock.
 *
 * `pollZones.test.js` proves the conversion arithmetic without a browser, which
 * is the right place for it. What it cannot see is whether the reader is ever
 * shown the result: the zone picker only exists on a ZONED poll, the second
 * line of each row header only exists once a zone is chosen, and a conversion
 * that crosses midnight has to say so or the reader books the wrong day.
 *
 * That last one is the reason this file exists. On a poll offering weekdays, a
 * time that converts past midnight lands on a *different weekday* than the
 * column it sits in, and a header that quietly showed the new time without
 * saying which day it belonged to would be worse than showing nothing.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

/** A poll fixed to Tokyo, offering one late-evening time. */
async function tokyoPoll(page) {
  await page.getByRole('link', { name: 'Create Poll' }).click();
  await page.getByLabel('Poll title').fill('Zoned Poll');
  await page.getByText('A fixed time zone').click();
  // Exact: "Time zone" is also a substring of the radio above it.
  await page.getByLabel('Time zone', { exact: true }).selectOption('Asia/Tokyo');
  await page.getByRole('button', { name: 'Monday' }).click();
  await page.getByRole('button', { name: 'Start building' }).click();

  // Morning in Tokyo, which is the direction that actually crosses midnight
  // going west: 08:00 JST is UTC+9, so 23:00 UTC the day before, so 16:00 in
  // Los Angeles the day before. An evening Tokyo time does not shift the day at
  // all -- 23:00 JST is 07:00 the same morning in LA -- which is worth writing
  // down because it is the obvious choice and it proves nothing.
  await page.getByRole('button', { name: 'Add a Time' }).click();
  await page.getByLabel('Starts at').fill('08:00');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.modal.is-active')).toHaveCount(0);
}

test('a wall-clock poll offers no zone picker at all', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await page.getByRole('link', { name: 'Create Poll' }).click();
  await page.getByLabel('Poll title').fill('Wall Clock Poll');
  await page.getByRole('button', { name: 'Monday' }).click();
  await page.getByRole('button', { name: 'Start building' }).click();

  // Wall clock is the default, and it means the times are the times. A picker
  // here would be offering to convert something that has nothing to convert.
  await expect(page.getByTestId('poll-display-zone')).toHaveCount(0);
});

test('a zoned poll converts for the reader and says when the day moves',
  async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await tokyoPoll(page);

    await page.getByRole('button', { name: 'Publish Poll' }).click();
    await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
    await page.getByRole('button', { name: 'close' }).click();

    const picker = page.getByTestId('poll-display-zone');
    await expect(picker).toBeVisible();

    // Read it from Los Angeles: Monday 08:00 in Tokyo is Sunday afternoon
    // there, so the row has to carry a day-shift marker as well as a time.
    await picker.selectOption('America/Los_Angeles');

    const grid = page.locator('#view-poll-table');
    await expect(grid).toContainText('8:00 AM');
    await expect(grid).toContainText('4:00 PM');
    await expect(grid).toContainText(/[−-]1d/);

    // Back to the poll's own zone: same clock, and nothing to warn about.
    await picker.selectOption('Asia/Tokyo');
    await expect(grid).not.toContainText(/[−-]1d/);
  });
