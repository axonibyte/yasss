/**
 * Narrow-viewport layout.
 *
 * The grid is a matrix — a cell means "this activity, at this window" — so it
 * cannot reflow to fewer columns without losing its meaning. It therefore holds
 * five columns at every width, which on a phone used to give roughly 65px per
 * tile. The fix is a floor on tile width plus horizontal scroll, and these pin
 * both halves of that: tiles stay legible, and the page itself never scrolls
 * sideways.
 */
import { test, expect } from '@playwright/test';
import { seed, waitForApp } from './helpers.js';

test.use({ viewport: { width: 390, height: 844 } }); // iPhone 12-ish

test('grid tiles stay legible on a phone', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 4, windows: 2 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  const cell = page.locator('.event-cell').nth(1);
  const box = await cell.boundingBox();
  // 7.5rem floor, less the grid gap. Anything near the old ~65px is a failure.
  expect(box.width).toBeGreaterThan(100);
});

test('the page itself does not scroll sideways', async ({ page, request }) => {
  // The grid scrolls within its own container; the document must not.
  const { eventId } = await seed(request, { event: { activities: 4, windows: 2 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('a narrow grid still fills the width rather than being floored', async ({ page, request }) => {
  // The floor is a minimum, not a fixed width, so a two-column grid is not
  // squeezed into 7.5rem columns with dead space beside it.
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  const grid = page.locator('#view-event-table .grid').first();
  const columns = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  const widths = columns.split(' ').map((w) => parseFloat(w));

  // Wider than the 7.5rem (120px) floor means `1fr` won and the columns grew to
  // fill the container, rather than being pinned at the minimum.
  expect(widths).toHaveLength(2);
  for (const w of widths) expect(w).toBeGreaterThan(120);
});
