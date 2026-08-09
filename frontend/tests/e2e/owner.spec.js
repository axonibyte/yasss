/**
 * Affordances gated on owning an event, or on being a platform admin.
 *
 * All of this was unreachable before authentication worked, and most of it is
 * where the rewrite makes a decision the legacy made differently or not at all.
 * The negative cases matter as much as the positive ones — "the owner sees X"
 * passes trivially for a build that shows X to everybody.
 */
import { test, expect } from '@playwright/test';
import { seed, seedSignedIn, signIn, waitForApp } from './helpers.js';
import { SUBMIT_RSVPS } from '../shared/labels.js';

/** Open an event as its owner. */
async function asOwner(page, request, eventSpec = {}) {
  const seeded = await seed(request, {
    user: {},
    event: { activities: 1, windows: 1, admin: 'self', ...eventSpec },
  });
  await signIn(page, { user: seeded.user, session: seeded.session });
  await page.goto(`/?event=${seeded.eventId}`);
  await waitForApp(page);
  return seeded;
}

/** Open somebody else's event while signed in as an unrelated account. */
async function asStranger(page, request, eventSpec = {}) {
  const owner = await seed(request, {
    user: {},
    event: { activities: 1, windows: 1, admin: 'self', ...eventSpec },
  });
  const stranger = await seed(request, { user: {} });
  await signIn(page, { user: stranger.user, session: stranger.session });
  await page.goto(`/?event=${owner.eventId}`);
  await waitForApp(page);
  return { owner, stranger };
}

test('the owner sees View Report; a signed-in stranger does not', async ({ page, request }) => {
  await asOwner(page, request);
  await expect(page.getByRole('button', { name: 'View Report' })).toBeVisible();

  await asStranger(page, request);
  await expect(page.getByRole('button', { name: 'View Report' })).toHaveCount(0);
});

test('Modify Event appears only for the owner', async ({ page, request }) => {
  await asOwner(page, request);
  await expect(page.getByRole('button', { name: 'Modify Event' })).toBeVisible();

  await asStranger(page, request);
  await expect(page.getByRole('button', { name: 'Modify Event' })).toHaveCount(0);
});

test('an anonymous visitor never sees Modify Event', async ({ page, request }) => {
  const seeded = await seed(request, {
    user: {}, event: { activities: 1, windows: 1, admin: 'self' },
  });
  await page.goto(`/?event=${seeded.eventId}`);
  await waitForApp(page);
  await expect(page.getByRole('button', { name: 'Modify Event' })).toHaveCount(0);
});

test('the one-signup cap does not apply to the owner', async ({ page, request }) => {
  // A volunteer already exists and multi-user signups are off, so a stranger is
  // capped — but the organizer must still be able to add people.
  const spec = { allowMultiUserSignups: false, volunteers: [{ name: 'Existing' }] };

  await asOwner(page, request, spec);
  await expect(page.getByRole('button', { name: 'Add Volunteer' })).toBeVisible();

  await asStranger(page, request, spec);
  await expect(page.getByRole('button', { name: 'Add Volunteer' })).toHaveCount(0);
});

test('the owner sees volunteers by name; a stranger sees only counts', async ({ page, request }) => {
  const spec = { volunteers: [{ name: 'Ada Lovelace' }] };

  await asOwner(page, request, spec);
  await expect(page.getByRole('option', { name: 'Ada Lovelace' })).toHaveCount(1);

  // The server filters volunteers it will not disclose, so the grid has to
  // render counts rather than names for everyone else.
  await asStranger(page, request, spec);
  await expect(page.getByRole('option', { name: 'Ada Lovelace' })).toHaveCount(0);
});

test('the guest prompt is suppressed for a signed-in visitor', async ({ page, request }) => {
  const seeded = await seed(request, { user: {}, event: { activities: 1, windows: 1 } });
  await signIn(page, { user: seeded.user, session: seeded.session });
  await page.goto(`/?event=${seeded.eventId}`);
  await waitForApp(page);

  await page.getByRole('button', { name: 'Add Volunteer' }).click();

  // The prompt exists to warn anonymous users they cannot edit later, which is
  // not true of someone with an account.
  await expect(page.getByText('Hey there friend!')).toHaveCount(0);
  await expect(page.getByLabel('Name')).toBeVisible();
});

/**
 * The admin exemption on an expired event.
 *
 * It used to reach exactly as far as the button: the expired branch swapped the
 * "This event has expired." pill for the submit control when the viewer was a
 * platform admin, and nothing else knew. `interactive` was `!expired` with no
 * admin clause, so `canAddVolunteer` was false, the grid ignored clicks and
 * `toggleRsvp` returned early — the admin got a button with no possible way to
 * put anything behind it, and `toBeVisible()` on a permanently disabled control
 * was happy to call that a passing test.
 *
 * So this drives the whole exemption rather than its first step: add somebody,
 * claim a square, and submit it, on an event that has already been and gone.
 */
test('a platform admin can still sign somebody up for an expired event',
  async ({ page, request }) => {
    const expired = { activities: 1, windows: 1, expired: true };

    // Note this is the *platform* ADMIN access level, not event ownership —
    // an owner without ADMIN gets the disabled pill like anyone else.
    const admin = await seed(request, {
      user: { accessLevel: 'ADMIN' }, event: { ...expired, admin: 'self' },
    });
    await signIn(page, { user: admin.user, session: admin.session });
    await page.goto(`/?event=${admin.eventId}`);
    await waitForApp(page);
    await expect(page.getByRole('button', { name: 'This event has expired.' }))
      .toHaveCount(0);

    // The part that was missing. Every one of these is a separate gate that
    // `interactive` closes, and each was shut for the admin too.
    await page.getByRole('button', { name: 'Add Volunteer' }).click();
    await page.getByLabel('Name').fill('Late Addition');
    await page.getByRole('button', { name: 'Save Volunteer' }).click();

    await page.locator('.event-cell li').filter({ hasText: /^Available$/ }).first().click();
    await expect(page.locator('.event-cell li').filter({ hasText: /^Booked$/ }))
      .toHaveCount(1);

    const submit = page.getByRole('button', { name: SUBMIT_RSVPS });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText('RSVP successfully submitted!')).toBeVisible();

    const standard = await seed(request, { user: {}, event: { ...expired, admin: 'self' } });
    await signIn(page, { user: standard.user, session: standard.session });
    await page.goto(`/?event=${standard.eventId}`);
    await waitForApp(page);
    await expect(page.getByRole('button', { name: 'This event has expired.' })).toBeDisabled();
    await expect(page.getByRole('button', { name: SUBMIT_RSVPS })).toHaveCount(0);
    // And the gates stay shut for them: no way in at all, not merely no button.
    await expect(page.getByRole('button', { name: 'Add Volunteer' })).toHaveCount(0);
  });

test('the profile modal prefills the current address', async ({ page, request }) => {
  const { user } = await seedSignedIn(page, request);
  await page.goto('/');
  await waitForApp(page);

  await page.getByRole('link', { name: 'Account' }).click();

  // Shown as a placeholder rather than a value, so submitting an untouched
  // form is a no-op rather than a redundant write.
  await expect(page.getByLabel('Change your email address?')).toHaveAttribute(
    'placeholder', user.email);
});

test('publishing while signed in skips the guest interstitial and claims the event',
  async ({ page, request }) => {
    await seedSignedIn(page, request);
    await page.goto('/');
    await waitForApp(page);

    await page.getByRole('link', { name: 'Create Event' }).click();
    await page.getByLabel('Event Title').fill('Owned From Birth');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Add an Activity' }).click();
    await page.getByLabel('Activity', { exact: true }).fill('Setup');
    await page.getByRole('button', { name: 'Save Activity' }).click();
    await page.getByRole('button', { name: 'Publish Event' }).click();

    await expect(page.getByText('Hey there friend!')).toHaveCount(0);
    await expect(page.getByText('Successfully created your event!')).toBeVisible();

    // The toast fires before the URL is pushed -- publishActions toasts, then
    // App awaits loadOwnedEvents, and only then calls goToEvent. Reloading on
    // the toast alone races that and lands back on the homepage, where there is
    // no Modify Event to find.
    await page.waitForURL(/\?event=/);

    // loadOwnedEvents runs after publishing, so the event is immediately editable.
    await page.reload();
    await waitForApp(page);
    await expect(page.getByRole('button', { name: 'Modify Event' })).toBeVisible();
  });
