/**
 * Reminder opt-in, confirmation, and unsubscribe.
 *
 * The whole feature is invisible from the browser once the form is submitted —
 * the address is deliberately never returned by the server, and the links
 * arrive by email. So the assertions past the form read the fake's stored
 * consent state through `/__test__`, and the two link handlers are driven by
 * navigating to the `?action=` URLs the mail templates build.
 *
 * The rule worth protecting here is the double opt-in: nothing may reach
 * CONFIRMED without proof of control of the address. A regression there is not
 * visible to anyone until the platform is already mailing strangers.
 */
import { test, expect } from '@playwright/test';
import { seed, seedSignedIn, waitForApp } from './helpers.js';

/** Reads back the consent state the API itself never discloses. */
async function reminderState(request, eventId, volunteerId) {
  const res = await request.get(`/__test__/volunteer/${eventId}/${volunteerId}/reminders`);
  return (await res.json()).reminder;
}

/** Signs up one volunteer, optionally opting into reminders. */
async function signUp(page, { name = 'Ada', email, signedIn = false } = {}) {
  await page.getByRole('button', { name: 'Add Volunteer' }).click();
  if (!signedIn) {
    await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  }
  await page.getByLabel('Name').fill(name);

  if (email !== undefined) {
    // bulma-switch hides the input behind its label, so the label is the
    // control a user can actually reach.
    await page.getByText('Email me a reminder before the event').click();
    if (email !== null) await page.getByLabel('Reminder Email').fill(email);
  }

  await page.getByRole('button', { name: 'Save Volunteer' }).click();
  await page.locator('.event-cell li').filter({ hasText: /^Available$/ }).first().click();
  await page.getByRole('button', { name: 'Submit RSVPs' }).click();
  await expect(page.getByText('RSVP successfully submitted!')).toBeVisible();
}

/**
 * The single volunteer on a freshly seeded event.
 *
 * Read through `/__test__` rather than `GET /events/:id`, because that endpoint
 * correctly hides volunteers from callers who may not see them -- including the
 * anonymous one that just created this volunteer.
 */
async function onlyVolunteerId(request, eventId) {
  const res = await request.get(`/__test__/volunteers/${eventId}`);
  return (await res.json()).volunteers[0] ?? null;
}

test('the email field appears only once reminders are switched on', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await page.getByRole('button', { name: 'Add Volunteer' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();

  await expect(page.getByLabel('Reminder Email')).toHaveCount(0);
  await page.getByText('Email me a reminder before the event').click();
  await expect(page.getByLabel('Reminder Email')).toBeVisible();
});

test('an anonymous volunteer must supply an address', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await page.getByRole('button', { name: 'Add Volunteer' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await page.getByLabel('Name').fill('Ada');
  await page.getByText('Email me a reminder before the event').click();
  await page.getByRole('button', { name: 'Save Volunteer' }).click();

  // Blocked client-side: the server has no account address to fall back on, so
  // submitting would be a 400 naming no field the volunteer could fix.
  await expect(page.getByText('Please provide an email address.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Volunteer' })).toBeVisible();
});

test('a malformed address is refused before it is sent', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await page.getByRole('button', { name: 'Add Volunteer' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await page.getByLabel('Name').fill('Ada');
  await page.getByText('Email me a reminder before the event').click();
  await page.getByLabel('Reminder Email').fill('not-an-address');
  await page.getByRole('button', { name: 'Save Volunteer' }).click();

  await expect(page.getByText('This needs to be an email address.')).toBeVisible();
});

test('opting in leaves the address pending, not confirmed', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await signUp(page, { email: 'Ada@Example.COM' });

  const volunteerId = await onlyVolunteerId(request, eventId);
  const reminder = await reminderState(request, eventId, volunteerId);

  // Lowercased on the way out — the server's email pattern is case-sensitive.
  expect(reminder.email).toBe('ada@example.com');
  // The load-bearing assertion: an address nobody has proven control of is
  // never confirmed by the act of typing it.
  expect(reminder.state).toBe('PENDING');
  expect(reminder.token).toBeTruthy();
});

test("a signed-in volunteer's own account address needs no confirmation", async ({
  page, request,
}) => {
  const { user, eventId } = await seedSignedIn(page, request, {
    event: { activities: 1, windows: 1 },
  });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await signUp(page, { email: user.email, signedIn: true });

  const volunteerId = await onlyVolunteerId(request, eventId);
  expect((await reminderState(request, eventId, volunteerId)).state).toBe('CONFIRMED');
});

test("naming somebody else's address still requires confirmation", async ({ page, request }) => {
  // Signing in must not become a way to subscribe an arbitrary stranger.
  const { eventId } = await seedSignedIn(page, request, {
    event: { activities: 1, windows: 1 },
  });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await signUp(page, { email: 'stranger@example.com', signedIn: true });

  const volunteerId = await onlyVolunteerId(request, eventId);
  const reminder = await reminderState(request, eventId, volunteerId);
  expect(reminder.email).toBe('stranger@example.com');
  expect(reminder.state).toBe('PENDING');
});

test('the emailed confirmation link confirms the subscription', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await signUp(page, { email: 'ada@example.com' });

  const volunteerId = await onlyVolunteerId(request, eventId);
  const { token } = await reminderState(request, eventId, volunteerId);

  await page.goto(
    `/?event=${eventId}&action=confirm-reminders&volunteer=${volunteerId}&token=${token}`,
  );
  await waitForApp(page);
  await expect(page.getByText("You're all set")).toBeVisible();

  expect((await reminderState(request, eventId, volunteerId)).state).toBe('CONFIRMED');
});

test('a wrong token confirms nothing and says nothing either way', async ({ page, request }) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await signUp(page, { email: 'ada@example.com' });
  const volunteerId = await onlyVolunteerId(request, eventId);

  await page.goto(
    `/?event=${eventId}&action=confirm-reminders&volunteer=${volunteerId}`
      + '&token=00000000-0000-0000-0000-000000000000',
  );
  await waitForApp(page);

  // Deliberately the same success message as a live token: telling an
  // anonymous caller which tokens are real would let anyone with a volunteer id
  // probe for active subscriptions.
  await expect(page.getByText("You're all set")).toBeVisible();
  expect((await reminderState(request, eventId, volunteerId)).state).toBe('PENDING');
});

test('the unsubscribe link stops reminders and suppresses the address', async ({
  page, request,
}) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await signUp(page, { email: 'ada@example.com' });

  const volunteerId = await onlyVolunteerId(request, eventId);
  const { token } = await reminderState(request, eventId, volunteerId);

  await page.goto(
    `/?event=${eventId}&action=unsubscribe-reminders&volunteer=${volunteerId}&token=${token}`,
  );
  await waitForApp(page);
  await expect(page.getByText('been unsubscribed')).toBeVisible();

  const after = await reminderState(request, eventId, volunteerId);
  expect(after.state).toBe('UNSUBSCRIBED');
  // Platform-wide, not just this row: per-row-only unsubscribe is how sending
  // domains end up blocklisted.
  expect(after.suppressed).toBe(true);
});

test('a confirmation link cannot resurrect an unsubscribed volunteer', async ({
  page, request,
}) => {
  const { eventId } = await seed(request, { event: { activities: 1, windows: 1 } });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await signUp(page, { email: 'ada@example.com' });

  const volunteerId = await onlyVolunteerId(request, eventId);
  const { token } = await reminderState(request, eventId, volunteerId);

  await page.goto(
    `/?event=${eventId}&action=unsubscribe-reminders&volunteer=${volunteerId}&token=${token}`,
  );
  await waitForApp(page);

  // Replaying the older confirmation link must not undo the opt-out.
  await page.goto(
    `/?event=${eventId}&action=confirm-reminders&volunteer=${volunteerId}&token=${token}`,
  );
  await waitForApp(page);

  expect((await reminderState(request, eventId, volunteerId)).state).toBe('UNSUBSCRIBED');
});

test('the address is never returned to the client', async ({ page, request }) => {
  // An organiser reading their own event sees that a volunteer has confirmed
  // reminders, but not where those reminders go.
  const { user, eventId, session } = await seedSignedIn(page, request, {
    event: { activities: 1, windows: 1, ownedBy: 'user' },
  });

  await page.goto(`/?event=${eventId}`);
  await waitForApp(page);
  await signUp(page, { email: 'ada@example.com', signedIn: true });

  const res = await request.get(`/v1/events/${eventId}`, {
    headers: { Authorization: `AXB-SIG-REQ ${session}` },
  });
  const body = JSON.stringify(await res.json());

  expect(body).not.toContain('ada@example.com');
  expect(body).not.toContain('reminderToken');
  expect(user).toBeTruthy();
});
