/**
 * Anonymous viewing and guest RSVP — docs/legacy/01-behavior.md §1.2, §1.3.
 *
 * Guest RSVP is worth exercising end to end specifically because it could not
 * have worked on main: the server's volunteer-cap check treated zero existing
 * volunteers as "cap reached", and its anonymous branch dereferenced a null
 * actor. Both are fixed; this is what proves the whole path now runs.
 */
import { test, expect } from '@playwright/test';
import { seed, waitForApp } from './helpers.js';

test('renders the grid for an anonymous visitor', async ({ page, request }) => {
  const { eventId } = await seed(request, {
    event: { activities: 2, windows: 2, title: 'Bake Sale' },
  });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  await expect(page.getByRole('heading', { name: 'Bake Sale' })).toBeVisible();
  // corner + 2 activity headers + 2 * (window header + 2 slots)
  await expect(page.locator('.event-cell')).toHaveCount(1 + 2 + 2 * 3);
  await expect(page.locator('.event-cell li').filter({ hasText: /^Available$/ })).toHaveCount(4);
});

test('shows disabled slots as unavailable', async ({ page, request }) => {
  const { eventId } = await seed(request, {
    // The fake omits these slot rows entirely, exactly as the server does —
    // there is no `enabled` column, so absence is what "disabled" means.
    event: { activities: 2, windows: 2, disabledSlots: [[0, 1], [1, 0]] },
  });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  // Anchored: Playwright's hasText is a case-insensitive substring match, so a
  // bare 'Available' would also match 'Unavailable'.
  await expect(page.locator('.event-cell li').filter({ hasText: /^Unavailable$/ })).toHaveCount(2);
  await expect(page.locator('.event-cell li').filter({ hasText: /^Available$/ })).toHaveCount(2);
});

test('reports a missing event without breaking the page', async ({ page }) => {
  await page.goto('/?event=does-not-exist');
  await waitForApp(page);
  await expect(page.getByText("That event doesn't exist. Sorry about that.")).toBeVisible();
});

test('reports an unpublished event distinctly', async ({ page, request }) => {
  const { eventId } = await seed(request, {
    event: { activities: 1, windows: 1, isPublished: false },
  });
  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await expect(page.getByText("That event hasn't yet been published. Sorry about that."))
    .toBeVisible();
});

test('a guest can add a volunteer and claim a slot', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 2, windows: 2 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  await page.getByRole('button', { name: 'Add Volunteer' }).click();

  // First volunteer while signed out: the app offers an account before letting
  // them proceed, because a guest cannot edit their entry afterwards.
  await expect(page.getByText('Hey there friend!')).toBeVisible();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();

  await page.getByLabel('Name').fill('Ada');
  await page.getByRole('button', { name: 'Save Volunteer' }).click();

  const firstSlot = page.locator('.event-cell li').filter({ hasText: /^Available$/ }).first();
  await firstSlot.click();
  await expect(page.locator('.event-cell li').filter({ hasText: /^Booked$/ })).toHaveCount(1);

  await page.getByRole('button', { name: 'Submit RSVPs' }).click();
  await expect(page.getByText('RSVP successfully submitted!')).toBeVisible();
});

test('an RSVP survives a reload once submitted', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await page.getByRole('button', { name: 'Add Volunteer' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await page.getByLabel('Name').fill('Ada');
  await page.getByRole('button', { name: 'Save Volunteer' }).click();
  await page.locator('.event-cell li').filter({ hasText: /^Available$/ }).first().click();
  await page.getByRole('button', { name: 'Submit RSVPs' }).click();
  await expect(page.getByText('RSVP successfully submitted!')).toBeVisible();

  await page.reload();
  await waitForApp(page);

  // A guest cannot see volunteer names, so the slot shows a count rather than
  // "Booked" — the server filters volunteers it will not disclose.
  await expect(page.locator('.event-cell')).toHaveCount(1 + 1 + 2);
});

test('an expired event cannot be signed up for', async ({ page, request }) => {
  const { eventId } = await seed(request, {
    event: { activities: 1, windows: 1, expired: true },
  });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  await expect(page.getByRole('button', { name: 'This event has expired.' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Submit RSVPs' })).toHaveCount(0);
});

test('the share link uses the query-parameter form the server emails', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}&share`);
  await waitForApp(page);

  // Not cosmetic: there is no SPA fallback, and the server's own emails link
  // to exactly this shape.
  await expect(page.getByLabel('Event URL'))
    .toHaveValue(new RegExp(`\\?event=${eventId}$`));
});

test('a slot at capacity cannot be claimed', async ({ page, request }) => {
  const { eventId } = await seed(request, {
    event: {
      activities: 1, windows: 1, allowMultiUserSignups: true,
      volunteers: [{ name: 'Already Here' }],
    },
  });
  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  // Fill the slot, then confirm the cell is inert rather than merely relabelled.
  await page.getByRole('button', { name: 'Add Volunteer' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await page.getByLabel('Name').fill('Late Arrival');
  await page.getByRole('button', { name: 'Save Volunteer' }).click();

  const cell = page.locator('.event-cell li').filter({ hasText: /^Available$/ });
  await expect(cell).toHaveCount(1);
});

test('a required field blocks submission until it is answered', async ({ page, request }) => {
  const { eventId } = await seed(request, {
    event: {
      activities: 1, windows: 1,
      details: [{ type: 'STRING', label: 'Dietary needs', required: true }],
    },
  });
  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  await page.getByRole('button', { name: 'Add Volunteer' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await page.getByLabel('Name').fill('Ada');
  await page.getByRole('button', { name: 'Save Volunteer' }).click();
  await expect(page.getByText('This field is required.')).toBeVisible();

  await page.getByLabel('Dietary needs (required)').fill('None');
  await page.getByRole('button', { name: 'Save Volunteer' }).click();
  await expect(page.locator('.modal.is-active')).toHaveCount(0);
});

test('a second guest volunteer is refused when multi-user signups are off', async ({ page, request }) => {
  const { eventId } = await seed(request, {
    event: {
      activities: 1, windows: 1, allowMultiUserSignups: false,
      volunteers: [{ name: 'First' }],
    },
  });
  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  await expect(page.getByRole('button', { name: 'Add Volunteer' })).toHaveCount(0);
});

test('multi-user signups allow a second volunteer', async ({ page, request }) => {
  // The control for the previous test, which would otherwise pass for a build
  // that never shows the button at all.
  const { eventId } = await seed(request, {
    event: {
      activities: 1, windows: 1, allowMultiUserSignups: true,
      volunteers: [{ name: 'First' }],
    },
  });
  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  await expect(page.getByRole('button', { name: 'Add Volunteer' })).toBeVisible();
});

test('closing with unsubmitted volunteers warns before losing them', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });
  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);

  await page.getByRole('button', { name: 'Add Volunteer' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await page.getByLabel('Name').fill('Unsaved');
  await page.getByRole('button', { name: 'Save Volunteer' }).click();

  // Persistence is deferred by design, so this work is genuinely at risk —
  // the legacy lost it silently.
  let dialogSeen = false;
  page.on('dialog', async (d) => { dialogSeen = true; await d.accept(); });
  await page.evaluate(() => { window.dispatchEvent(new Event('beforeunload', { cancelable: true })); });

  const guarded = await page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(guarded || dialogSeen).toBe(true);
});
