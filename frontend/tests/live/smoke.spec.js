/**
 * The real stack: real Java server, real MariaDB, real schema, real bundle.
 *
 * These are deliberately few and load-bearing. Everything the fake can check is
 * already checked faster elsewhere; what only this suite can check is that the
 * frontend's assumptions about the server are actually true. Every assertion
 * here is one that would have passed against the fake and failed against the
 * real thing if I had got the contract wrong.
 *
 * State is built through the UI because there is no seeding backdoor, so the
 * specs run serially and each creates what it needs.
 */
import { test, expect } from '@playwright/test';

/** Past the deliberate minimum splash. */
async function ready(page) {
  await page.waitForSelector('.pageloader:not(.is-active)', { timeout: 30_000 });
}

/**
 * Build a published event and return its id from the URL.
 * Anonymous, which is the path that could not have worked before the
 * volunteer-cap and CAPTCHA fixes.
 */
async function publishEvent(page, title) {
  await page.goto('/');
  await ready(page);

  await page.getByRole('link', { name: 'Create Event' }).click();
  await page.getByLabel('Event Title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('button', { name: 'Add an Activity' }).click();
  await page.getByLabel('Activity', { exact: true }).fill('Setup');
  await page.getByRole('button', { name: 'Save Activity' }).click();

  // A window is what makes slots exist at all -- activities alone give a grid
  // with no rows. This also drives bulma-calendar, the one imperative island in
  // the app, which nothing else exercises.
  await page.getByRole('button', { name: 'Add a Window' }).click();
  await page.getByRole('button', { name: 'Save Window' }).click();
  await expect(page.locator('.modal.is-active')).toHaveCount(0);

  await page.getByRole('button', { name: 'Publish Event' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await expect(page.getByText('Successfully created your event!')).toBeVisible();

  await page.waitForURL(/\?event=/);
  return new URL(page.url()).searchParams.get('event');
}

test('the server serves the app it was built with', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  // Served from the jar's classpath, so this proves the Gradle -> Vite ->
  // processResources chain produced a bundle the server can actually serve.
  await expect(page.getByRole('heading', { name: 'Yasss!' })).toBeVisible();
  await expect(page.getByText('Sign me up!')).toBeVisible();
});

test('the call-to-action text is fetched and rendered as markdown', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  // GET /v1/texts/coa returns text/markdown, not JSON — a contract the client
  // has to handle specially.
  await expect(page.getByText('end-to-end environment')).toBeVisible();
  const link = page.locator('#coa-section a', { hasText: 'link' });
  await expect(link).toHaveClass(/has-text-primary/);
});

test('the terms modal opens with a title', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  await page.getByRole('link', { name: 'Terms of Service' }).click();
  // The legacy never populated this title, so the modal opened with an empty
  // header bar.
  await expect(page.locator('.modal.is-active .modal-card-title'))
    .toHaveText('Terms of Service');
  await expect(page.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible();
});

test('an anonymous visitor can create and publish an event', async ({ page }) => {
  const eventId = await publishEvent(page, 'Live Charity Drive');
  expect(eventId).toBeTruthy();

  // The share URL carries the short code rather than the UUID: eight characters
  // somebody can copy off a screen, against thirty-six of hex. The query-string
  // shape is unchanged, which is what the server's own emails link to.
  const shown = page.locator('[data-testid="event-code"]');
  await expect(shown).toBeVisible();
  const pretty = await shown.inputValue();
  expect(pretty).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);

  const canonical = pretty.replace('-', '');
  await expect(page.getByLabel('Event URL')).toHaveValue(new RegExp(`\\?event=${canonical}$`));

  // And the UUID form still resolves, so every link already in the world keeps
  // working. This is an alias, not a replacement.
  await page.goto(`/?event=${eventId}`);
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Live Charity Drive' })).toBeVisible();

  // As does the code, spelled the way somebody would after reading it aloud.
  await page.goto(`/?event=${pretty.toLowerCase()}`);
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Live Charity Drive' })).toBeVisible();
});

test('a published event reloads from the database with its slots intact', async ({ page }) => {
  const eventId = await publishEvent(page, 'Live Reload Check');

  await page.goto(`/?event=${eventId}`);
  await ready(page);

  await expect(page.getByRole('heading', { name: 'Live Reload Check' })).toBeVisible();
  await expect(page.locator('.event-cell li').filter({ hasText: /^Setup$/ })).toBeVisible();

  // The slot must come back enabled. The server creates a slot for every pair
  // the payload does not explicitly disable, so this is what catches a payload
  // that silently flipped a slot's state on the way through.
  await expect(page.locator('.event-cell li').filter({ hasText: /^Available$/ })).toHaveCount(1);
});

test('a guest can sign up, and the RSVP persists to the database', async ({ page }) => {
  const eventId = await publishEvent(page, 'Live Guest RSVP');

  await page.goto(`/?event=${eventId}`);
  await ready(page);

  await page.getByRole('button', { name: 'Add Volunteer' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Save Volunteer' }).click();

  await page.locator('.event-cell li').filter({ hasText: /^Available$/ }).first().click();
  await expect(page.locator('.event-cell li').filter({ hasText: /^Booked$/ })).toHaveCount(1);

  await page.getByRole('button', { name: 'Submit RSVPs' }).click();
  await expect(page.getByText('RSVP successfully submitted!')).toBeVisible();

  // This is the assertion the whole containerised stack exists for. On main it
  // was unreachable: AddVolunteer counted zero existing volunteers as "cap
  // reached", and its anonymous branch dereferenced a null actor into a 500.
  const res = await page.request.get(`/v1/events/${eventId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const counted = body.event.activities
    .flatMap((a) => a.slots)
    .reduce((n, s) => n + s.rsvpCount, 0);
  expect(counted).toBe(1);
});

test('an unknown event is reported rather than crashing', async ({ page }) => {
  await page.goto('/?event=00000000-0000-0000-0000-000000000000');
  await ready(page);
  await expect(page.getByText("That event doesn't exist. Sorry about that.")).toBeVisible();
});

test('the grid renders with the classes the design depends on', async ({ page }) => {
  const eventId = await publishEvent(page, 'Live Grid Classes');
  await page.goto(`/?event=${eventId}`);
  await ready(page);

  // Guards against a build that drops or renames Bulma classes: the unit suite
  // asserts these against components, this asserts them against what the
  // server actually shipped.
  const cell = page.locator('.event-cell ul').first();
  await expect(cell).toHaveClass(/block-list/);
  await expect(cell).toHaveClass(/is-small/);
  await expect(cell).toHaveClass(/is-centered/);
  await expect(page.locator('.fixed-grid.has-2-cols')).toBeVisible();
});

test('the stylesheet actually loaded', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  // A missing stylesheet leaves everything unstyled but every DOM assertion
  // still passing, so check a computed value rather than a class.
  const bg = await page.locator('.navbar').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');

  const brand = page.locator('.navbar-brand strong');
  const color = await brand.evaluate((el) => getComputedStyle(el).color);
  // The brand turquoise, darkened to `--bulma-primary-on-scheme` wherever it is
  // used as *text*: hsl(171, 100%, 41%) reads at about 1.8:1 on the page
  // background, which axe flags as a serious contrast failure and which is
  // genuinely hard to read. Same hue, same saturation; backgrounds are
  // untouched. Still an exact value, because the point of this test is to
  // notice when the stylesheet has not loaded at all.
  expect(color).toBe('rgb(0, 107, 91)');
});
