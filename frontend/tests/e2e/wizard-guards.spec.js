/**
 * Guards on the two most destructive things the shell can do.
 *
 * Both of these were reachable by ordinary use and neither was covered, because
 * every existing wizard test starts from a blank page — which is exactly the
 * state in which they behave correctly.
 */
import { test, expect } from '@playwright/test';
import { seed, seedSignedIn, signIn, waitForApp } from './helpers.js';

test.describe('creating an event while one is on screen', () => {
  /**
   * "Create Event" is a navbar link, live on every screen including an event
   * you are looking at. `saveSummaryModal` branched on `event.persisted` — which
   * is true whenever an event is loaded — rather than on the caller's `isNew`,
   * so the new title went out as a PATCH against the event on screen. The empty
   * description box went with it, wiping the description.
   */
  test('creates a new event rather than overwriting the loaded one',
    async ({ page, request }) => {
      const seeded = await seed(request, {
        user: {},
        event: {
          activities: 1, windows: 1, admin: 'self',
          title: 'Original Title', description: 'Original description',
        },
      });
      await signIn(page, { user: seeded.user, session: seeded.session });
      await page.goto(`/?event=${seeded.eventId}`);
      await waitForApp(page);
      await expect(page.getByRole('heading', { name: 'Original Title' })).toBeVisible();

      // Any PATCH against the loaded event is the bug, whatever it carries.
      const patches = [];
      page.on('request', (r) => {
        if (r.method() === 'PATCH' && r.url().includes(`/v1/events/${seeded.eventId}`)) {
          patches.push(r.url());
        }
      });

      await page.getByRole('link', { name: 'Create Event' }).click();
      await page.locator('#event-title').fill('A Completely New Event');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByRole('heading', { name: 'A Completely New Event' })).toBeVisible();
      expect(patches, 'the loaded event must not be patched').toEqual([]);

      // The URL is cleared too, or a reload would resurrect the old event over
      // the half-built new one.
      await expect(page).not.toHaveURL(/\?event=/);

      // And the original is untouched on the server.
      const { event } = await (await request.get(`/v1/events/${seeded.eventId}`)).json();
      expect(event.shortDescription).toBe('Original Title');
      expect(event.longDescription).toBe('Original description');
    });

  test('still edits in place when Edit Summary is the entry point',
    async ({ page, request }) => {
      // The control case: the same modal, opened with isNew false, must patch.
      const seeded = await seed(request, {
        user: {},
        event: { activities: 1, windows: 1, admin: 'self', title: 'Editable' },
      });
      await signIn(page, { user: seeded.user, session: seeded.session });
      await page.goto(`/?event=${seeded.eventId}`);
      await waitForApp(page);

      await page.getByRole('button', { name: 'Modify Event' }).click();
      await page.getByRole('button', { name: 'Edit Summary' }).click();
      await page.locator('#event-title').fill('Renamed In Place');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByRole('heading', { name: 'Renamed In Place' })).toBeVisible();
      const { event } = await (await request.get(`/v1/events/${seeded.eventId}`)).json();
      expect(event.shortDescription).toBe('Renamed In Place');
    });
});

test.describe('in-flight guards', () => {
  /**
   * Publishing an event graph is the slowest request in the app and had no
   * feedback whatsoever, so a second click POSTed a second event.
   */
  test('a second Publish click while the first is in flight is ignored',
    async ({ page }) => {
      await page.goto('/');
      await waitForApp(page);
      await page.getByRole('link', { name: 'Create Event' }).click();
      await page.locator('#event-title').fill('Double Click');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('button', { name: 'Add an Activity' }).click();
      await page.locator('#activity-label').fill('Setup');
      await page.getByRole('button', { name: 'Save Activity' }).click();

      const posts = [];
      page.on('request', (r) => {
        if (r.method() === 'POST' && /\/v1\/events$/.test(r.url())) posts.push(r.url());
      });

      // Hold the response open so the second click lands while the first is
      // genuinely still in flight — the whole window the bug lived in.
      let release;
      const held = new Promise((resolve) => { release = resolve; });
      await page.route('**/v1/events', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        await held;
        return route.continue();
      });

      const publish = page.getByRole('button', { name: 'Publish Event' });
      await publish.click();
      const guest = page.getByRole('button', { name: "No thanks, I'm good!" });
      if (await guest.count()) await guest.click();

      await expect(publish).toBeDisabled();
      // A disabled button swallows the click; force it through anyway, which is
      // what a determined double-click does.
      await publish.dispatchEvent('click');

      release();
      await page.waitForURL(/\?event=/, { timeout: 20_000 });
      expect(posts.length, 'exactly one event should have been created').toBe(1);
    });

  /**
   * `requestCaptcha` *rejects* when the visitor dismisses the challenge, and
   * publish was the only caller without a catch — so the rejection escaped an
   * unawaited promise and nothing happened at all.
   */
  test('dismissing the CAPTCHA during publish reports it', async ({ page, request }) => {
    await seedSignedIn(page, request);
    // A site key is what makes the CAPTCHA modal appear at all.
    await page.route('**/v1', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      return route.fulfill({ json: { ...body, captcha: 'test-site-key' } });
    });

    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Create Event' }).click();
    await page.locator('#event-title').fill('Captcha Dismissed');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Add an Activity' }).click();
    await page.locator('#activity-label').fill('Setup');
    await page.getByRole('button', { name: 'Save Activity' }).click();

    await page.getByRole('button', { name: 'Publish Event' }).click();
    await expect(page.locator('.modal.is-active')).toHaveCount(1);
    await page.locator('.modal.is-active button.delete').click();

    // Before the catch this was silent: no toast, no state change, and the
    // button still live with nothing to explain why nothing had happened.
    await expect(page.locator('.notification.is-danger')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish Event' })).toBeEnabled();
  });
});
