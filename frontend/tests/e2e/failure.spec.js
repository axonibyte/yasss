/**
 * What the app does when a request fails.
 *
 * Every one of these paths is written the same deliberate way — toast, return
 * false, and only *then* update the local model — so that a failed save leaves
 * the screen showing the truth rather than an optimistic lie. None of it was
 * exercised, because nothing in the suite could make a request fail.
 *
 * All of it lives on the fake config rather than the live one. `page.route`
 * intercepts in the browser, so the client cannot tell which server it was
 * denied by; the live suite's watchdog fails any test that sees a 5xx, which is
 * the oracle that makes the live suite worth running and not worth disabling;
 * and the seeding here is one call instead of a full wizard drive.
 */
import { test, expect } from '@playwright/test';
import { seed, seedSignedIn, signIn, waitForApp } from './helpers.js';

const boom = (route) => route.fulfill({
  status: 500,
  contentType: 'application/json',
  body: JSON.stringify({ status: 'error', info: 'boom' }),
});

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

test.describe('a rejected save', () => {
  test('keeps the modal open, the typed value intact, and the grid truthful',
    async ({ page, request }) => {
      await openEditor(page, request);

      await page.locator('#view-event-table .grid > *').nth(1).click();
      await expect(page.locator('.modal-card-title')).toContainText('Activity');
      await page.locator('#activity-label').fill('Renamed');

      await page.route('**/v1/events/*/activities/*', boom);
      await page.getByRole('button', { name: 'Save Activity' }).click();

      // The three things that together mean "nothing was lost".
      await expect(page.locator('.modal-card-title')).toContainText('Activity');
      await expect(page.locator('#activity-label')).toHaveValue('Renamed');
      await expect(page.locator('.notification.is-danger')).toContainText('boom');
      // The grid must not show a name the server refused to store. This is the
      // assertion that pins the ordering in `structureActions`: toast and bail
      // *before* `Object.assign`, never after.
      await expect(page.locator('#view-event-table')).not.toContainText('Renamed');

      // And that the failure was transient rather than terminal.
      await page.unroute('**/v1/events/*/activities/*');
      await page.getByRole('button', { name: 'Save Activity' }).click();
      await expect(page.locator('.modal-card')).toHaveCount(0);
    });

  test('reports the operation that failed, not the browser’s network wording',
    async ({ page, request }) => {
      await openEditor(page, request);

      await page.locator('#view-event-table .grid > *').nth(1).click();
      await page.locator('#activity-label').fill('Renamed');

      // A dead network, which is the one failure with no server message to show.
      await page.route('**/v1/events/*/activities/*', (route) => route.abort('failed'));
      await page.getByRole('button', { name: 'Save Activity' }).click();

      const toast = page.locator('.notification.is-danger');
      await expect(toast).toBeVisible();
      // Before the fix this read "Failed to fetch" — Chromium's words, not
      // ours, different in every engine, and no help to anyone.
      await expect(toast).not.toContainText(/failed to fetch/i);
      await expect(toast).toContainText(/activity/i);
    });
});

test.describe('loading an event that cannot be shown', () => {
  // Each status has its own message, and the difference is the whole point:
  // "that event doesn't exist" and "you need to pay for it" are not the same
  // news. The predicates key off the HTTP status, so the fulfilled status
  // matters as much as the body.
  const cases = [
    { status: 404, text: /doesn't exist/i },
    { status: 402, text: /hasn't yet been published/i },
    { status: 403, text: /access denied/i },
    { status: 500, text: /internal error/i },
  ];

  for (const { status, text } of cases) {
    test(`a ${status} says so, and falls back to the intro`, async ({ page }) => {
      await page.route('**/v1/events/*', (route) => route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', info: 'nope' }),
      }));

      await page.goto('/?event=00000000-0000-0000-0000-000000000000');
      await waitForApp(page);

      await expect(page.locator('.notification.is-danger')).toContainText(text);
      // A blank page would be the worse failure.
      await expect(page.getByRole('link', { name: 'Create Event' })).toBeVisible();
    });
  }
});

test.describe('a rejected volunteer edit', () => {
  // This one path wrote the local model *before* the request and closed the
  // modal regardless, so a failed save left the new name on screen against the
  // old server state, with the form gone and no way to retry. Every other
  // mutation in the app already got this right.
  async function openVolunteerEditor(page, request) {
    const seeded = await seed(request, {
      user: {},
      event: {
        activities: 1,
        windows: 1,
        admin: 'self',
        title: 'Has Volunteers',
        volunteers: [{ name: 'Original Name' }],
      },
    });
    await signIn(page, { user: seeded.user, session: seeded.session });
    await page.goto(`/?event=${seeded.eventId}`);
    await waitForApp(page);
    return seeded;
  }

  test('keeps the modal open and leaves the old name on the page',
    async ({ page, request }) => {
      await openVolunteerEditor(page, request);

      await page.getByRole('button', { name: 'Update Volunteer' }).click();
      await expect(page.locator('.modal-card-title')).toContainText(/volunteer/i);
      await page.locator('#vol-name').fill('Renamed');

      await page.route('**/v1/events/*/volunteers/*', boom);
      await page.getByRole('button', { name: 'Save Volunteer' }).click();

      await expect(page.locator('.notification.is-danger')).toContainText('boom');
      // Still open, still holding what was typed, so Save can be pressed again.
      await expect(page.locator('.modal-card')).toBeVisible();
      await expect(page.locator('#vol-name')).toHaveValue('Renamed');

      // And the name the server refused must not be showing behind it. The
      // picker is where a volunteer's name is rendered, so it is the surface
      // that would have carried the optimistic lie.
      await page.keyboard.press('Escape');
      await expect(page.locator('.modal-card')).toHaveCount(0);
      await expect(page.locator('#view-event-volunteer')).not.toContainText('Renamed');
      await expect(page.locator('#view-event-volunteer')).toContainText('Original Name');
    });

  test('lands the change once the server stops refusing', async ({ page, request }) => {
    await openVolunteerEditor(page, request);

    await page.getByRole('button', { name: 'Update Volunteer' }).click();
    await page.locator('#vol-name').fill('Renamed');

    await page.route('**/v1/events/*/volunteers/*', boom);
    await page.getByRole('button', { name: 'Save Volunteer' }).click();
    await expect(page.locator('.notification.is-danger')).toBeVisible();

    await page.unroute('**/v1/events/*/volunteers/*');
    await page.getByRole('button', { name: 'Save Volunteer' }).click();

    await expect(page.locator('.modal-card')).toHaveCount(0);
    await expect(page.locator('#view-event-volunteer')).toContainText('Renamed');
  });
});

test('opening an event that fails puts the URL back', async ({ page, request }) => {
  // The address bar moves before the load, so a failure used to leave
  // `?event=X` showing over a dashboard — which meant reloading reproduced the
  // error and there was no obvious way out.
  const me = await seed(request, {
    user: {}, event: { activities: 1, windows: 1, admin: 'self', title: 'Doomed Event' },
  });
  await signIn(page, { user: me.user, session: me.session });
  await page.goto('/');
  await waitForApp(page);

  await page.route('**/v1/events/*', boom);
  await page.getByText('Doomed Event').click();

  await expect(page.locator('.notification.is-danger')).toBeVisible();
  await expect(page).toHaveURL(/\/$|\/\?$/);
  await expect(page.getByText('Your Upcoming Events')).toBeVisible();
});

test('a mid-session rejection does not log you out', async ({ page, request }) => {
  // Session loss is decided only by `Session.refresh`, at boot and on a timer.
  // A single forbidden request is not evidence that the session is gone, and
  // treating it as such would throw away unsaved work. This protects that
  // decision from a well-meaning refactor.
  await openEditor(page, request);

  await page.locator('#view-event-table .grid > *').nth(1).click();
  await page.locator('#activity-label').fill('Renamed');
  await page.route('**/v1/events/*/activities/*', (route) => route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'error', info: 'access denied' }),
  }));
  await page.getByRole('button', { name: 'Save Activity' }).click();

  await expect(page.locator('.notification.is-danger')).toBeVisible();
  await expect(page.getByText('Your user session was lost!')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Log Out' })).toBeVisible();
});

test('a blocked pop-up is explained rather than ignored', async ({ page, request }) => {
  // `openReport` is otherwise unreachable in an automated browser, and its
  // failure mode — nothing happens at all — is the one users report as "the
  // button is broken".
  await seedSignedIn(page, request, {
    user: {},
    event: { activities: 1, windows: 1, admin: 'self' },
  });
  await page.addInitScript(() => { window.open = () => null; });

  const seeded = await seed(request, {
    user: {},
    event: { activities: 1, windows: 1, admin: 'self' },
  });
  await signIn(page, { user: seeded.user, session: seeded.session });
  await page.goto(`/?event=${seeded.eventId}`);
  await waitForApp(page);

  await page.getByRole('button', { name: 'View Report' }).click();
  await expect(page.locator('.notification.is-danger')).toContainText(/pop-?ups?/i);
});
