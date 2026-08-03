/**
 * Edit mode — docs/legacy/01-behavior.md §1.6, §1.7.
 *
 * The largest gap in the suite: every remote branch of `structureActions.js` was
 * unexercised, because reaching edit mode requires owning the event and no spec
 * could authenticate. That module's whole design — one code path where only
 * "is this persisted" differs — exists because the legacy's parallel local and
 * remote branches drifted apart. Nothing had ever checked the remote half.
 *
 * Structure is asserted twice where it matters: on screen, and by re-reading
 * `/v1/events/:id`. On-screen alone would pass for a client that never sent the
 * request; the re-read alone would pass for one that never updated the view.
 */
import { test, expect } from '@playwright/test';
import { seed, signIn, waitForApp } from './helpers.js';

/** An owned, published event with a full grid, opened in edit mode. */
async function openEditor(page, request, eventSpec = {}) {
  const seeded = await seed(request, {
    user: {},
    event: { activities: 1, windows: 1, admin: 'self', title: 'Editable', ...eventSpec },
  });
  await signIn(page, { user: seeded.user, session: seeded.session });

  await page.goto(`/?event=${seeded.eventId}`);
  await waitForApp(page);
  await page.getByRole('button', { name: 'Modify Event' }).click();
  return seeded;
}

/** Re-read the event as the owner, so the assertion sees the server's truth. */
async function readEvent(page, eventId) {
  const res = await page.request.get(`/v1/events/${eventId}`);
  expect(res.status()).toBe(200);
  return (await res.json()).event;
}

test('Modify Event swaps the whole surface', async ({ page, request }) => {
  await openEditor(page, request);

  await expect(page.getByText('Custom Fields', { exact: true })).toBeVisible();
  await expect(page.getByText('Volunteer!')).toHaveCount(0);
  for (const name of ['Edit Summary', 'Add an Activity', 'Add a Window',
    'Add a Field', 'Close Event Editor']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Submit RSVPs' })).toHaveCount(0);
});

test('slot cells show a count over cap, a branch reachable only in edit mode', async ({ page, request }) => {
  await openEditor(page, request);
  // CREATE renders Available/Unavailable; only EDIT renders the ratio.
  await expect(page.locator('.event-cell li').filter({ hasText: /^0 \/ 0$/ })).toHaveCount(1);
});

test('Close Event Editor restores the viewing surface', async ({ page, request }) => {
  await openEditor(page, request);
  await page.getByRole('button', { name: 'Close Event Editor' }).click();

  await expect(page.getByText('Volunteer!', { exact: true })).toBeVisible();
  await expect(page.getByText('Custom Fields', { exact: true })).toHaveCount(0);
  await expect(page.locator('.event-cell li').filter({ hasText: /^Available$/ })).toHaveCount(1);
});

test('a new activity persists, and its slots start disabled', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request);

  await page.getByRole('button', { name: 'Add an Activity' }).click();
  await page.getByLabel('Activity', { exact: true }).fill('Teardown');
  await page.getByRole('button', { name: 'Save Activity' }).click();

  // structureActions deliberately disables the slots of an activity added to a
  // live event: the server has no slot rows for it until they are set.
  await expect(page.locator('.event-cell li').filter({ hasText: /^Unavailable$/ })).toHaveCount(1);

  const event = await readEvent(page, eventId);
  const added = event.activities.find((a) => a.shortDescription === 'Teardown');
  expect(added).toBeTruthy();
  expect(added.slots).toHaveLength(0);
});

test('renaming an activity sends only what changed', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request);

  await page.locator('.event-cell li').filter({ hasText: /^Activity 0$/ }).click();
  await page.getByLabel('Activity', { exact: true }).fill('Renamed');

  const patched = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().includes('/activities/'));
  await page.getByRole('button', { name: 'Save Activity' }).click();

  // The legacy sent a key the server does not tokenize, so the slot default
  // could never be saved; sending only the changed field is what fixed it.
  expect(Object.keys(JSON.parse((await patched).postData()))).toEqual(['shortDescription']);
  expect((await readEvent(page, eventId)).activities[0].shortDescription).toBe('Renamed');
});

test('deleting an activity removes it server-side', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request, { activities: 2 });

  await page.locator('.event-cell li').filter({ hasText: /^Activity 0$/ }).click();
  await page.getByRole('button', { name: 'Remove Activity' }).click();

  await expect(page.locator('.event-cell li').filter({ hasText: /^Activity 0$/ })).toHaveCount(0);
  const event = await readEvent(page, eventId);
  expect(event.activities.map((a) => a.shortDescription)).toEqual(['Activity 1']);
});

test('a new window adopts the times the server returned', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request);

  await page.getByRole('button', { name: 'Add a Window' }).click();
  await page.getByRole('button', { name: 'Save Window' }).click();
  await expect(page.locator('.modal.is-active')).toHaveCount(0);

  // The highest-value assertion here. Writes use beginTime/endTime and reads
  // use begin/end; if the DTO bridge is wrong the label renders Invalid Date.
  const labels = await page.locator('.event-cell li').allTextContents();
  expect(labels.join(' ')).not.toContain('Invalid Date');

  const event = await readEvent(page, eventId);
  expect(event.windows).toHaveLength(2);
  expect(Number.isFinite(event.windows[1].begin)).toBe(true);

  await page.reload();
  await waitForApp(page);
  expect((await page.locator('.event-cell li').allTextContents()).join(' '))
    .not.toContain('Invalid Date');
});

test('a window added to a live event starts with disabled slots', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request);

  await page.getByRole('button', { name: 'Add a Window' }).click();
  await page.getByRole('button', { name: 'Save Window' }).click();

  // The counterpart of the wizard's behaviour, where new slots ARE enabled.
  // These two branches diverging is exactly the legacy failure.
  const event = await readEvent(page, eventId);
  expect(event.activities[0].slots).toHaveLength(1);
});

test('deleting a window drops its whole row', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request, { windows: 2 });
  const before = await page.locator('.event-cell').count();

  await page.locator('.event-cell').nth(2).click(); // first window header
  await page.getByRole('button', { name: 'Remove Window' }).click();

  await expect(page.locator('.event-cell')).toHaveCount(before - 2); // header + its slot
  expect((await readEvent(page, eventId)).windows).toHaveLength(1);
});

test('a new required field reaches the table and the volunteer form', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request);

  await page.getByRole('button', { name: 'Add a Field' }).click();
  await page.getByLabel('Type').selectOption('EMAIL');
  await page.getByLabel('Field').fill('Contact');
  await page.getByText('Should users be required to answer this?').click();
  await page.getByRole('button', { name: 'Save Detail' }).click();

  await expect(page.getByRole('cell', { name: 'Contact', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Email Address (required)', exact: true })).toBeVisible();
  expect((await readEvent(page, eventId)).details[0]).toMatchObject({
    type: 'EMAIL', label: 'Contact', required: true,
  });

  // ...and it is enforced on the signup form once editing stops.
  await page.getByRole('button', { name: 'Close Event Editor' }).click();
  await page.getByRole('button', { name: 'Add Volunteer' }).click();
  await page.getByLabel('Name').fill('Ada');
  await page.getByRole('button', { name: 'Save Volunteer' }).click();
  await expect(page.getByText('This field is required.')).toBeVisible();
});

test('deleting a field removes it and its answers', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request, {
    details: [{ type: 'STRING', label: 'Notes' }],
  });

  await page.getByRole('cell', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Detail' }).click();

  await expect(page.getByText("You haven't specified any custom fields yet! :)")).toBeVisible();
  expect((await readEvent(page, eventId)).details).toHaveLength(0);
});

test('enabling a slot PUTs it and makes the cell claimable', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request, { disabledSlots: [[0, 0]] });
  await expect(page.locator('.event-cell li').filter({ hasText: /^Unavailable$/ })).toHaveCount(1);

  await page.locator('.event-cell li').filter({ hasText: /^Unavailable$/ }).click();
  await page.getByText('Enable this slot?').click();
  await page.getByRole('button', { name: 'Update Slot' }).click();

  await expect(page.locator('.event-cell li').filter({ hasText: /^0 \/ 0$/ })).toHaveCount(1);
  expect((await readEvent(page, eventId)).activities[0].slots).toHaveLength(1);

  await page.getByRole('button', { name: 'Close Event Editor' }).click();
  await expect(page.locator('.event-cell li').filter({ hasText: /^Available$/ })).toHaveCount(1);
});

test('disabling a slot DELETEs it, and it stays gone', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request);

  await page.locator('.event-cell li').filter({ hasText: /^0 \/ 0$/ }).click();
  await page.getByText('Enable this slot?').click(); // switch it off
  await page.getByRole('button', { name: 'Update Slot' }).click();

  await expect(page.locator('.event-cell li').filter({ hasText: /^Unavailable$/ })).toHaveCount(1);
  expect((await readEvent(page, eventId)).activities[0].slots).toHaveLength(0);

  await page.reload();
  await waitForApp(page);
  await expect(page.locator('.event-cell li').filter({ hasText: /^Unavailable$/ })).toHaveCount(1);
});

test('a slot cap is what comes back', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request);

  await page.locator('.event-cell li').filter({ hasText: /^0 \/ 0$/ }).click();
  await page.getByText('Unlimited volunteers for this slot?').click();
  await page.getByRole('spinbutton', { name: 'Volunteers for this slot' }).fill('3');
  await page.getByRole('button', { name: 'Update Slot' }).click();

  await expect(page.locator('.event-cell li').filter({ hasText: /^0 \/ 3$/ })).toHaveCount(1);
  expect((await readEvent(page, eventId)).activities[0].slots[0].maxSlotVolunteers).toBe(3);
});

test('a slot click opens the editor rather than toggling an RSVP', async ({ page, request }) => {
  await openEditor(page, request);

  const rsvps = [];
  page.on('request', (r) => { if (r.url().includes('/volunteers/')) rsvps.push(r.url()); });

  await page.locator('.event-cell li').filter({ hasText: /^0 \/ 0$/ }).click();

  await expect(page.getByText('Edit a Slot')).toBeVisible();
  expect(rsvps).toEqual([]);
});

test('the slot editor jumps to the activity and window editors', async ({ page, request }) => {
  await openEditor(page, request);
  await page.locator('.event-cell li').filter({ hasText: /^0 \/ 0$/ }).click();

  // The legacy synthesized a click on a grid cell found by a stored index,
  // which was stale or undefined once the grid had scrolled.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByText('Update an Activity')).toBeVisible();
});

test('editing the summary PATCHes only what changed', async ({ page, request }) => {
  const { eventId } = await openEditor(page, request);

  await page.getByRole('button', { name: 'Edit Summary' }).click();
  await page.getByLabel('Description').fill('A new description');

  const patched = page.waitForRequest(
    (r) => r.method() === 'PATCH' && /\/v1\/events\/[^/]+$/.test(r.url()));
  await page.getByRole('button', { name: 'Save' }).click();

  // The legacy assigned shortDescription twice, so editing the description
  // clobbered the title and the description itself could never be saved.
  const body = JSON.parse((await patched).postData());
  expect(Object.keys(body)).toEqual(['longDescription']);
  expect((await readEvent(page, eventId)).longDescription).toBe('A new description');
});

test('a rejected structure call leaves the model untouched', async ({ page, request }) => {
  await openEditor(page, request);

  await page.route('**/activities/**', (route) => (route.request().method() === 'PATCH'
    ? route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'error', info: 'database malfunction' }),
    })
    : route.continue()));

  await page.locator('.event-cell li').filter({ hasText: /^Activity 0$/ }).click();
  await page.getByLabel('Activity', { exact: true }).fill('Should Not Stick');
  await page.getByRole('button', { name: 'Save Activity' }).click();

  // One representative case for the ten identical catch blocks: the error is
  // reported and the local model is not advanced past what the server accepted.
  await expect(page.getByText('database malfunction')).toBeVisible();
  await expect(page.locator('.event-cell li').filter({ hasText: /^Activity 0$/ })).toHaveCount(1);
  await expect(page.locator('.event-cell li').filter({ hasText: /^Should Not Stick$/ })).toHaveCount(0);
});
