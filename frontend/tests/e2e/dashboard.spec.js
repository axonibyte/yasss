/**
 * The logged-in dashboard.
 *
 * Worth its own file because this surface was non-functional on `main`:
 * `ListEventsEndpoint` required ADMIN, so a normal user listing their own
 * events got a 403 and the client then read `.events` off `undefined`. These
 * are the first tests of the widened authorization from the client side.
 */
import { test, expect } from '@playwright/test';
import { seed, seedSignedIn, signIn, waitForApp } from './helpers.js';

test('a signed-in visitor lands on the dashboard, not the call to action', async ({ page, request }) => {
  await seedSignedIn(page, request);
  await page.goto('/');
  await waitForApp(page);

  await expect(page.getByText('Your Upcoming Events')).toBeVisible();
  await expect(page.getByText('Your Upcoming RSVPs')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create an Event!' })).toHaveCount(0);
});

test('an anonymous visitor gets the call to action instead', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await expect(page.getByRole('button', { name: 'Create an Event!' })).toBeVisible();
  await expect(page.getByText('Your Upcoming Events')).toHaveCount(0);
});

test('the two boxes are scoped independently', async ({ page, request }) => {
  const me = await seed(request, {
    user: {}, event: { activities: 1, windows: 1, admin: 'self', title: 'Event I Run' },
  });
  // An event somebody else runs, which I have signed up for.
  await seed(request, {
    event: {
      activities: 1, windows: 1, title: 'Event I Joined',
      volunteers: [{ name: 'Me', user: me.user.id }],
    },
  });

  await signIn(page, { user: me.user, session: me.session });
  await page.goto('/');
  await waitForApp(page);

  const owned = page.locator('.box').filter({ hasText: 'Your Upcoming Events' });
  const rsvped = page.locator('.box').filter({ hasText: 'Your Upcoming RSVPs' });

  await expect(owned.getByText('Event I Run')).toBeVisible();
  await expect(owned.getByText('Event I Joined')).toHaveCount(0);
  await expect(rsvped.getByText('Event I Joined')).toBeVisible();
});

test('each box fires exactly one listing request', async ({ page, request }) => {
  await seedSignedIn(page, request);

  const listings = [];
  page.on('request', (r) => {
    if (r.url().includes('/v1/events?')) listings.push(r.url());
  });

  await page.goto('/');
  await waitForApp(page);
  await expect(page.getByText('Your Upcoming Events')).toBeVisible();
  await page.waitForTimeout(500);

  // The legacy fired these from inside its response-header absorption, which
  // ran on essentially every API call — so any request triggered two more
  // (behavior §6.22). One per box, driven by the account, is the fix.
  //
  // Counted by the `earliest` filter, which only the dashboard applies. Boot
  // also calls listEvents once without it, to learn which events this account
  // owns for the "Modify Event" affordance — a different query, not a repeat.
  const dashboard = listings.filter((u) => u.includes('earliest='));
  expect(dashboard).toHaveLength(2);
  expect(dashboard.filter((u) => u.includes('admin='))).toHaveLength(1);
  expect(dashboard.filter((u) => u.includes('volunteer='))).toHaveLength(1);
});

test('an empty dashboard says so rather than rendering nothing', async ({ page, request }) => {
  await seedSignedIn(page, request);
  await page.goto('/');
  await waitForApp(page);

  // Distinct from the loading state, which is the point of the distinction.
  await expect(page.getByText('No events.')).toHaveCount(2);
  await expect(page.getByText('Loading...')).toHaveCount(0);
});

test('selecting an event from the dashboard opens it', async ({ page, request }) => {
  const seeded = await seed(request, {
    user: {}, event: { activities: 1, windows: 1, admin: 'self', title: 'Pick Me' },
  });
  await signIn(page, { user: seeded.user, session: seeded.session });

  await page.goto('/');
  await waitForApp(page);
  await page.getByRole('button', { name: 'Pick Me' }).click();

  await expect(page).toHaveURL(new RegExp(`\\?event=${seeded.eventId}`));
  await expect(page.getByRole('heading', { name: 'Pick Me' })).toBeVisible();
});

test('listing another account is refused', async ({ page, request }) => {
  const me = await seedSignedIn(page, request);
  const other = await seed(request, { user: {} });

  await page.goto('/');
  await waitForApp(page);

  // The client never does this, but the rule is what makes the widened
  // authorization safe: scoped to yourself is allowed, scoped to anyone else
  // is not. The Java-side negative lives in ListEventsAuthorizationTest.
  //
  // The header has to be set by hand: the app builds it in JS from the session
  // it holds, so a raw request context carries no credentials at all.
  const auth = { Authorization: `AXB-SIG-REQ ${me.session}` };

  const mine = await page.request.get(`/v1/events?admin=${me.user.id}`, { headers: auth });
  expect(mine.status()).toBe(200);

  const theirs = await page.request.get(`/v1/events?admin=${other.user.id}`, { headers: auth });
  expect(theirs.status()).toBe(403);

  // ...and an unscoped listing is refused too, or the widening would be a hole.
  const unscoped = await page.request.get('/v1/events', { headers: auth });
  expect(unscoped.status()).toBe(403);
});
