/**
 * Reordering activities and custom fields.
 *
 * The server has always been ready for this — `priority` is tokenized on both
 * endpoints and is the column each list is sorted by — but nothing ever set it.
 * The legacy's `mvActivity`/`mvDetail` were unreachable dead code that never
 * touched priority and never called the API, so this is a feature gap rather
 * than a regression.
 *
 * The assertions check both halves: the order on screen, and the priorities the
 * server was actually told. A move that only reorders the local array looks
 * identical until the page is reloaded.
 */
import { test, expect } from '@playwright/test';
import { seed, signIn, waitForApp } from './helpers.js';

/**
 * The grid's cells in DOM order: the blank corner, then the activity headers,
 * then each window row. So activity N is at index N + 1.
 *
 * Note `.event-cell` and not `.event-cell.is-primary` — the aesthetic classes
 * sit on an inner element, not on the cell itself.
 */
const cells = (page) => page.locator('.event-cell');
const activityHeader = (page, i) => cells(page).nth(i + 1);

/** An owned, published event opened in edit mode. */
async function openEditor(page, request, eventSpec = {}) {
  const seeded = await seed(request, {
    user: {},
    event: { activities: 2, windows: 1, admin: 'self', ...eventSpec },
  });
  await signIn(page, { user: seeded.user, session: seeded.session });

  await page.goto(`/?event=${seeded.eventId}`);
  await waitForApp(page);
  await page.getByRole('button', { name: 'Modify Event' }).click();
  return seeded;
}

test('an activity moves right, and the server is told', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request, { activities: 3 });
  await page.getByRole('button', { name: 'Activity 0', exact: true }).click();
  await page.getByRole('button', { name: 'Move Right' }).click();

  // On screen, in their new order.
  await expect(activityHeader(page, 0)).toHaveText('Activity 1');
  await expect(activityHeader(page, 1)).toHaveText('Activity 0');

  // And in the server's own ordering key, which is what survives a reload.
  const res = await request.get(`/v1/events/${eventId}`);
  const activities = (await res.json()).event.activities;
  const byLabel = Object.fromEntries(
    activities.map((a) => [a.shortDescription, a.priority]),
  );
  expect(byLabel['Activity 1']).toBeLessThan(byLabel['Activity 0']);
});

test('the leftmost activity offers no move left', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request);
  await page.getByRole('button', { name: 'Activity 0', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Move Left' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Move Right' })).toBeVisible();
});

test('the order survives a reload', async ({ page, request }) => {
  // The point of pushing priority at all: a purely local reorder looks right
  // until the page comes back from the server.
  const { eventId } = await openEditor(page, request);
  await page.getByRole('button', { name: 'Activity 0', exact: true }).click();
  await page.getByRole('button', { name: 'Move Right' }).click();
  await expect(activityHeader(page, 0)).toHaveText('Activity 1');

  await page.reload();
  await waitForApp(page);
  await expect(activityHeader(page, 0)).toHaveText('Activity 1');
});

test('a custom field moves down, and the server is told', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request, {
    activities: 1,
    details: [
      { type: 'STRING', label: 'First', required: false },
      { type: 'STRING', label: 'Second', required: false },
    ],
  });

  const rows = page.locator('#view-event-details tbody tr');
  await expect(rows.nth(1)).toContainText('First');

  await page.getByRole('button', { name: 'Move First down' }).click();
  await expect(rows.nth(1)).toContainText('Second');
  await expect(rows.nth(2)).toContainText('First');

  const res = await request.get(`/v1/events/${eventId}`);
  const details = (await res.json()).event.details;
  const byLabel = Object.fromEntries(details.map((d) => [d.label, d.priority]));
  expect(byLabel.Second).toBeLessThan(byLabel.First);
});

test('the ends of the field list have their moves disabled', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request, {
    activities: 1,
    details: [
      { type: 'STRING', label: 'First', required: false },
      { type: 'STRING', label: 'Second', required: false },
    ],
  });

  await expect(page.getByRole('button', { name: 'Move First up' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move Second down' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move First down' })).toBeEnabled();
});
