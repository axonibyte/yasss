/**
 * Leaving the page, and moving through history.
 *
 * Two defects lived here, both of the kind that never show up in a happy-path
 * test because nothing in a happy path goes backwards:
 *
 *   - the unload guard asked only whether there were unsubmitted *volunteers*,
 *     so an organizer fifteen minutes into building an event — activities,
 *     windows, custom fields, none of it yet sent anywhere — could close the tab
 *     and be asked nothing at all; and
 *
 *   - nothing listened for `popstate`, so Back after publishing rewound the URL
 *     while the app carried on showing the event. The address bar and the screen
 *     disagreed, and a reload or a shared link then produced something else
 *     again.
 */
import { test, expect } from '@playwright/test';
import { seed, waitForApp } from './helpers.js';

/**
 * Ask the page whether the app would block an unload, without involving the
 * native dialog.
 *
 * Playwright can be made to surface a real beforeunload prompt, but only via
 * `page.close({ runBeforeUnload: true })`, only after a user gesture, and with
 * behavior that differs per engine. Registering a second listener and reading
 * `defaultPrevented` asks the same question of the same handler and answers it
 * deterministically. The app binds its listener at mount, well before this runs,
 * so ours observes the result of theirs.
 */
async function wouldWarnOnUnload(page) {
  return page.evaluate(() => {
    let guarded = false;
    const probe = (e) => { if (e.defaultPrevented) guarded = true; };
    window.addEventListener('beforeunload', probe);
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    window.removeEventListener('beforeunload', probe);
    return guarded;
  });
}

test.describe('the unload guard', () => {
  test('says nothing on a page with no work on it', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    expect(await wouldWarnOnUnload(page)).toBe(false);
  });

  test('warns about a half-built event with no volunteers on it', async ({ page }) => {
    // The case that went unwarned. Nothing here is remote yet — the whole graph
    // goes to the server in one POST at publish — so closing the tab loses all
    // of it.
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Create Event' }).click();
    await page.locator('#event-title').fill('Bake Sale');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Add an Activity' }).click();
    await page.locator('#activity-label').fill('Setup');
    await page.getByRole('button', { name: 'Save Activity' }).click();

    expect(await wouldWarnOnUnload(page)).toBe(true);
  });

  test('says nothing about an event that is only being looked at', async ({ page, request }) => {
    // The counterpart: a published event has nothing pending, and warning here
    // would train people to click through the dialog without reading it.
    const { eventId } = await seed(request, { event: { activities: 2, windows: 1 } });
    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);

    expect(await wouldWarnOnUnload(page)).toBe(false);
  });
});

test.describe('history', () => {
  test('Back after publishing leaves the event view too', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Create Event' }).click();
    await page.locator('#event-title').fill('Fun Run');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Add an Activity' }).click();
    await page.locator('#activity-label').fill('Setup');
    await page.getByRole('button', { name: 'Save Activity' }).click();
    await page.getByRole('button', { name: 'Publish Event' }).click();
    const guest = page.getByRole('button', { name: "No thanks, I'm good!" });
    if (await guest.count()) await guest.click();
    await page.waitForURL(/\?event=/);
    // The URL is pushed before the event view has finished settling, and the
    // share modal opens on top of it. Going back mid-flight would be testing
    // the race rather than the navigation.
    await expect(page.locator('#view-event-table')).toBeVisible();
    const share = page.locator('.modal-card');
    if (await share.count()) await page.locator('button.delete').first().click();
    await expect(page.locator('.modal-card')).toHaveCount(0);

    await page.goBack();

    // Before the popstate listener, all three of these were false: the URL went
    // home and the event stayed on screen.
    await expect(page).not.toHaveURL(/\?event=/);
    await expect(page.locator('#view-event-table')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Create Event' })).toBeVisible();
  });

  test('Forward brings it back', async ({ page, request }) => {
    const { eventId } = await seed(request, { event: { activities: 2, windows: 1 } });
    await page.goto('/');
    await waitForApp(page);
    await page.goto(`/?event=${eventId}`);
    await waitForApp(page);

    await page.goBack();
    await expect(page.locator('#view-event-table')).toHaveCount(0);

    await page.goForward();
    await expect(page.locator('#view-event-table')).toBeVisible();
  });

  test('Back from one event to another shows the first one', async ({ page, request }) => {
    const a = await seed(request, { event: { activities: 1, windows: 1, title: 'Event Alpha' } });
    const b = await seed(request, { event: { activities: 1, windows: 1, title: 'Event Beta' } });

    await page.goto(`/?event=${a.eventId}`);
    await waitForApp(page);
    await expect(page.getByRole('heading', { name: 'Event Alpha' })).toBeVisible();

    await page.goto(`/?event=${b.eventId}`);
    await waitForApp(page);
    await expect(page.getByRole('heading', { name: 'Event Beta' })).toBeVisible();

    await page.goBack();
    // Not merely "the URL changed" — the event actually reloaded.
    await expect(page.getByRole('heading', { name: 'Event Alpha' })).toBeVisible();
  });

  test('opening a modal from the navbar survives its own hash change', async ({ page }) => {
    // Every navbar item is an `href="#..."` link, and Chromium fires popstate
    // for a fragment navigation as well as for history traversal. A listener
    // that reacted to every popstate closed the modal the click had just
    // opened — which is exactly what happened, and why the handler compares the
    // route before doing anything.
    await page.goto('/');
    await waitForApp(page);

    await page.getByRole('link', { name: 'Log In' }).click();
    await expect(page.locator('.modal-card')).toHaveCount(1);

    await page.locator('button.delete').click();
    await page.getByRole('link', { name: 'Create Event' }).click();
    await expect(page.locator('#event-title')).toBeVisible();
  });

  test('a bogus event id reports once and does not loop', async ({ page }) => {
    // A re-entrant implementation — an `$effect` on `route.eventId` that also
    // writes it — shows up here as a storm of toasts rather than one.
    //
    // The home page first, so that Back has somewhere inside the app to go.
    await page.goto('/');
    await waitForApp(page);
    await page.goto('/?event=00000000-0000-0000-0000-000000000000');
    await waitForApp(page);
    await expect(page.locator('.notification.is-danger')).toHaveCount(1);

    await page.goBack();
    await expect(page.getByRole('link', { name: 'Create Event' })).toBeVisible();

    // Counted rather than asserted equal to one: toasts dismiss themselves
    // after five seconds, so the surviving number is a race. What is not a race
    // is that a re-entrant handler would be minting new ones continuously, so
    // the count is sampled twice and must not be climbing.
    const danger = page.locator('.notification.is-danger');
    const first = await danger.count();
    await page.waitForTimeout(1000);
    expect(await danger.count()).toBeLessThanOrEqual(first);
  });
});
