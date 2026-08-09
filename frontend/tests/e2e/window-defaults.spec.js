/**
 * The window picker's default range, across time zones and DST boundaries.
 *
 * `tomorrowAt` builds the default 08:00–17:00 window with `setDate` and
 * `setHours`, which are local-wall-clock operations. The resulting *instant*
 * therefore depends entirely on the organizer's zone — and the whole suite ran
 * pinned to UTC, so nothing ever noticed. That is a gap rather than a bug: the
 * intent is "8am where the organizer is", and these assert the intent rather
 * than a fixed epoch, so they hold in every zone.
 *
 * The zone pair is chosen to be 25 hours apart. Anything that accidentally
 * compares UTC calendar days rather than instants fails on one of them.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

/** Publishes an event accepting the picker's default window; returns its id. */
async function publishWithDefaultWindow(page, title) {
  await page.goto('/');
  await waitForApp(page);
  await page.getByRole('link', { name: 'Create Event' }).click();
  await page.locator('#event-title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Add an Activity' }).click();
  await page.locator('#activity-label').fill('Setup');
  await page.getByRole('button', { name: 'Save Activity' }).click();
  await page.getByRole('button', { name: 'Add a Window' }).click();
  await page.getByRole('button', { name: 'Save Window' }).click();
  await page.getByRole('button', { name: 'Publish Event' }).click();
  const guest = page.getByRole('button', { name: "No thanks, I'm good!" });
  if (await guest.count()) await guest.click();
  await page.waitForURL(/\?event=/);
  return new URL(page.url()).searchParams.get('event');
}

/** The hour an instant falls on, as read in a particular zone. */
function hourIn(epochMillis, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', hour12: false,
  }).format(new Date(Number(epochMillis)));
}

for (const zone of ['Pacific/Kiritimati', 'Pacific/Niue', 'UTC']) {
  test.describe(`an organizer in ${zone}`, () => {
    test.use({ timezoneId: zone });

    test('gets a default window that starts at 8am their time', async ({ page, request }) => {
      const id = await publishWithDefaultWindow(page, `Default ${zone}`);

      const { event } = await (await request.get(`/v1/events/${id}`)).json();
      // UTC+14 and UTC−11: the same wall-clock hour, 25 hours of instant apart.
      expect(hourIn(event.windows[0].begin, zone)).toBe('08');
      expect(hourIn(event.windows[0].end, zone)).toBe('17');
    });
  });
}

test.describe('across a DST boundary', () => {
  // `clock.setFixedTime` rather than `clock.install`: install fakes timers as
  // well, and the session refresh runs on a ten-minute one. A faked timer there
  // either stalls the refresh or, with `runFor`, fires it repeatedly in the
  // middle of an assertion.
  test.use({ timezoneId: 'America/New_York' });

  test('spring forward keeps the default at 8am local, not an hour out',
    async ({ page, request }) => {
      // 2026-03-07, the day before the US spring-forward. "Tomorrow at 08:00"
      // is therefore 08:00 EDT — 12:00Z, not the 13:00Z that a naive offset
      // carried over from the previous day would produce.
      await page.clock.setFixedTime(new Date('2026-03-07T17:00:00Z'));

      const id = await publishWithDefaultWindow(page, 'Spring Forward');
      const { event } = await (await request.get(`/v1/events/${id}`)).json();

      expect(hourIn(event.windows[0].begin, 'America/New_York')).toBe('08');
      expect(hourIn(event.windows[0].begin, 'UTC')).toBe('12');
    });

  test('fall back keeps the window ordered through the repeated hour',
    async ({ page, request }) => {
      // 2026-11-01 has two 01:30s. The default window does not span them, so
      // this pins the property that actually matters — the range stays ordered
      // and both ends land on the intended wall-clock hours — rather than
      // over-specifying which of the two instants is chosen.
      await page.clock.setFixedTime(new Date('2026-10-31T16:00:00Z'));

      const id = await publishWithDefaultWindow(page, 'Fall Back');
      const { event } = await (await request.get(`/v1/events/${id}`)).json();

      expect(Number(event.windows[0].begin)).toBeLessThan(Number(event.windows[0].end));
      expect(hourIn(event.windows[0].begin, 'America/New_York')).toBe('08');
      expect(hourIn(event.windows[0].end, 'America/New_York')).toBe('17');
    });
});
