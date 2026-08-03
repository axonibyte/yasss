/**
 * Window times render in the event's zone, not the viewer's.
 *
 * Playwright's `timezoneId` puts the browser somewhere specific, which is the
 * only way to prove this: the whole defect was that the grid rendered in
 * whatever zone the viewer happened to sit in while email rendered in the
 * server's, so the same shift was described two different ways depending on
 * where you read it.
 *
 * For a physical event the event's own zone is the right one — a bake sale that
 * starts at 9am starts at 9am where the bake sale is.
 */
import { test, expect } from '@playwright/test';
import { seed, waitForApp } from './helpers.js';

/** 2026-01-15T18:00:00Z — 12:00 in Chicago, 03:00 the next day in Tokyo. */
const BEGIN = Date.parse('2026-01-15T18:00:00Z');
const END = BEGIN + 3_600_000;

/** An event pinned to a zone, with one window at a known instant. */
async function seedZoned(request, timezone) {
  return seed(request, {
    event: {
      activities: 1,
      windows: 1,
      timezone,
      windowTimes: [{ begin: BEGIN, end: END }],
    },
  });
}

test.describe('viewer in Tokyo', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test("renders an event's window in the event's zone", async ({ page, request }) => {
    const { eventId } = await seedZoned(request, 'America/Chicago');

    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);

    // Chicago noon, not the 03:00 the viewer's own browser would have shown.
    await expect(page.locator('.event-cell').filter({ hasText: '12:00 PM' })).toHaveCount(1);
    await expect(page.locator('.event-cell').filter({ hasText: '03:00 AM' })).toHaveCount(0);
  });

  test('names the zone once, on the event', async ({ page, request }) => {
    const { eventId } = await seedZoned(request, 'America/Chicago');

    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);

    // January, so CST rather than the CDT today's date would report.
    await expect(page.getByTestId('zone-note')).toContainText('CST (America/Chicago)');
  });

  test('falls back to the viewer’s zone when the event records none', async ({ page, request }) => {
    // Every event created before the column existed is in this state, and must
    // keep rendering exactly as it did.
    const { eventId } = await seedZoned(request, null);

    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);

    await expect(page.locator('.event-cell').filter({ hasText: '03:00 AM' })).toHaveCount(1);
    // Nothing to announce: the viewer is already in the zone being used.
    await expect(page.getByTestId('zone-note')).toHaveCount(0);
  });

  test('says nothing when the event’s zone is already the viewer’s', async ({ page, request }) => {
    const { eventId } = await seedZoned(request, 'Asia/Tokyo');

    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);

    await expect(page.locator('.event-cell').filter({ hasText: '03:00 AM' })).toHaveCount(1);
    await expect(page.getByTestId('zone-note')).toHaveCount(0);
  });
});

test.describe('viewer in Chicago', () => {
  test.use({ timezoneId: 'America/Chicago' });

  test('sees the same wall-clock time as a viewer in Tokyo', async ({ page, request }) => {
    // The point of the whole change: one event, one stated time, wherever the
    // volunteer reads it from.
    const { eventId } = await seedZoned(request, 'America/Chicago');

    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);

    await expect(page.locator('.event-cell').filter({ hasText: '12:00 PM' })).toHaveCount(1);
    await expect(page.getByTestId('zone-note')).toHaveCount(0);
  });
});

test.describe('publishing from Tokyo', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('a new event records the browser’s zone', async ({ page, request }) => {
    // The capture step: whoever builds the event is presumably in the place it
    // happens, so their browser's zone is the best guess available.
    await page.goto('/');
    await waitForApp(page);

    await page.getByRole('link', { name: 'Create Event' }).click();
    await page.getByLabel('Event Title').fill('Zoned Event');
    await page.getByRole('button', { name: 'Save' }).click();

    await page.getByRole('button', { name: 'Add an Activity' }).click();
    await page.getByLabel('Activity', { exact: true }).fill('Setup');
    await page.getByRole('button', { name: 'Save Activity' }).click();

    await page.getByRole('button', { name: 'Publish Event' }).click();
    await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
    await expect(page.getByText('Successfully created your event!')).toBeVisible();

    const id = new URL(page.url()).searchParams.get('event');
    const res = await request.get(`/v1/events/${id}`);
    expect((await res.json()).event.timezone).toBe('Asia/Tokyo');
  });
});

test('the server refuses a zone it cannot resolve', async ({ request }) => {
  // Validated against the tz database rather than a pattern, because every
  // renderer downstream hands the value straight to a zone lookup.
  const res = await request.post('/v1/events', {
    data: {
      shortDescription: 'Bad Zone',
      longDescription: '',
      timezone: 'Mars/Olympus_Mons',
      details: [],
      windows: [{ beginTime: String(BEGIN), endTime: String(END) }],
      activities: [],
    },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).info).toContain('timezone');
});
