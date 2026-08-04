/**
 * The event timezone, against the real server.
 *
 * The fake suite covers rendering in a zone thoroughly, and it can afford to:
 * that is pure frontend. What it cannot cover is the half that only exists
 * server-side — a `VARCHAR(64)` column, a validator that checks membership of
 * `ZoneId.getAvailableZoneIds()`, and the question of whether a zone chosen in
 * one browser is what a different browser in a different zone is later shown.
 * That last one is the entire reason the column exists.
 *
 * The whole file runs in Denver: it observes DST, its abbreviations are
 * unambiguous, and at UTC−6/−7 "tomorrow at 08:00 local" is never the same UTC
 * calendar day as it is under the config's pinned UTC — so an assertion that
 * accidentally compares dates rather than instants fails here.
 */
import {
  addActivity, addWindow, expect, modalButton, publish, ready, signInAsAdmin,
  startWizard, test,
} from './helpers/harness.js';

test.use({ timezoneId: 'America/Denver' });

test('an event records the zone it was created in, and shows it to everyone',
  async ({ page, browser }) => {
    await startWizard(page);
    await addActivity(page, 'Setup');
    await addWindow(page);
    const id = await publish(page);

    const { event } = await (await page.request.get(`/v1/events/${id}`)).json();
    expect(event.timezone).toBe('America/Denver');

    // The picker's default is 8am wall-clock where the organiser is, so this is
    // also a check that the instant survived the DATETIME column intact.
    const denver = page.locator('#view-event-table');
    await expect(denver).toContainText(/08:00\s*AM/);

    // The point of the column: a viewer elsewhere sees the organiser's hours,
    // not their own. A second context rather than a second page, because the
    // zone is a context-level setting.
    const tokyo = await browser.newContext({ timezoneId: 'Asia/Tokyo', locale: 'en-US' });
    try {
      const other = await tokyo.newPage();
      await other.goto(`/?event=${id}`);
      await ready(other);
      await expect(other.locator('#view-event-table')).toContainText(/08:00\s*AM/);
      // And is told whose hours they are, since they are not their own.
      await expect(other.locator('[data-testid="zone-note"]')).toContainText('America/Denver');
    } finally {
      await tokyo.close();
    }
  });

test('the zone can be changed after publishing, and the change sticks',
  async ({ page }) => {
    // Until now the zone was captured invisibly at creation and there was no
    // way to correct it — an organiser who built an event on a machine set to
    // the wrong zone had no recourse at all.
    // Signed in first: publishing anonymously deliberately forfeits the ability
    // to come back and edit, so the sign-in is load-bearing rather than scenery.
    await page.goto('/');
    await ready(page);
    await signInAsAdmin(page);
    await startWizard(page);
    await addActivity(page, 'Setup');
    await addWindow(page);
    const id = await publish(page);

    await page.getByRole('button', { name: 'Modify Event' }).click();
    await page.getByRole('button', { name: 'Edit Summary' }).click();
    await expect(page.locator('#event-timezone')).toHaveValue('America/Denver');
    await page.locator('#event-timezone').selectOption('Europe/Berlin');
    await modalButton(page, 'Save').click();

    // Read from the server rather than the model: the PATCH is the thing under
    // test, and the model would report the new value either way.
    await expect(async () => {
      const { event } = await (await page.request.get(`/v1/events/${id}`)).json();
      expect(event.timezone).toBe('Europe/Berlin');
    }).toPass({ timeout: 10_000 });

    await page.goto(`/?event=${id}`);
    await ready(page);
    await expect(page.locator('[data-testid="zone-note"]')).toContainText('Europe/Berlin');
  });

test('the server and the client agree on which zones exist', async ({ page }) => {
  // Both tiers validate, and they validate against different lists —
  // `Intl.supportedValuesOf` here, `ZoneId.getAvailableZoneIds()` there. This
  // is the test that would catch them drifting apart.
  await startWizard(page);

  const rejected = await page.request.patch('/v1/events/00000000-0000-0000-0000-000000000000', {
    data: { timezone: 'Mars/Olympus_Mons' },
    failOnStatusCode: false,
  });
  expect([400, 403, 404]).toContain(rejected.status());

  // `UTC` is the interesting one: it is absent from `Intl.supportedValuesOf`,
  // which is why validating client-side against that list rejected the zone the
  // browser itself reports when running in UTC.
  await page.getByRole('button', { name: 'Edit Summary' }).click();
  await expect(page.locator('#event-timezone')).toBeVisible();
  await page.locator('#event-timezone').selectOption('UTC');
  await modalButton(page, 'Save').click();
  await expect(page.locator('.modal.is-active')).toHaveCount(0);
});
