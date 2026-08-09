/**
 * Getting around, and getting told what happened.
 *
 * Everything here was reachable with a mouse and unreachable, unreadable or
 * unrecoverable without one — plus the one thing that was too easy with a
 * mouse: destroying somebody's schedule in a single click.
 */
import { test, expect } from '@playwright/test';
import { seed, seedSignedIn, signIn, waitForApp } from './helpers.js';

const MODAL = '.modal-card';

async function openEditor(page, request, eventSpec = {}) {
  const seeded = await seed(request, {
    user: {},
    event: {
      activities: 1, windows: 1, admin: 'self', title: 'Editable', ...eventSpec,
    },
  });
  await signIn(page, { user: seeded.user, session: seeded.session });
  await page.goto(`/?event=${seeded.eventId}`);
  await waitForApp(page);
  await page.getByRole('button', { name: 'Modify Event' }).click();
  return seeded;
}

// --- confirmation before anything irreversible ------------------------------

test.describe('removing something', () => {
  // There was no confirmation anywhere and no undo either. In edit mode the
  // Remove button sits directly beside Save, and every one of these deletions
  // is immediate and server-side.

  test('asks first, and says what will be lost', async ({ page, request }) => {
    await openEditor(page, request);

    await page.locator('#view-event-table .grid > *').nth(1).click();
    await page.getByRole('button', { name: 'Remove Activity' }).click();

    await expect(page.locator(MODAL)).toContainText(/remove this activity\?/i);
    await expect(page.locator('[data-testid="confirm-detail"]'))
      .toContainText(/RSVP|cannot be undone/i);
  });

  test('canceling puts the editor back and changes nothing',
    async ({ page, request }) => {
      await openEditor(page, request);

      await page.locator('#view-event-table .grid > *').nth(1).click();
      await page.getByRole('button', { name: 'Remove Activity' }).click();
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Back where they were, not dumped onto the page behind.
      await expect(page.locator('.modal-card-title')).toContainText('Activity');
      await page.keyboard.press('Escape');
      await expect(page.locator('#view-event-table')).toContainText('Activity 0');
    });

  test('confirming actually removes it', async ({ page, request }) => {
    await openEditor(page, request);

    await page.locator('#view-event-table .grid > *').nth(1).click();
    await page.getByRole('button', { name: 'Remove Activity' }).click();
    await page.locator(MODAL).getByRole('button', { name: 'Remove Activity' }).click();

    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator('#view-event-table')).not.toContainText('Activity 0');
  });

  test('does not put the destructive button under the first Enter',
    async ({ page, request }) => {
      // The confirmation is focus-trapped and takes its first focusable control.
      // Whatever that turns out to be, it must not be the one that destroys
      // something: Enter on a dialog nobody has read has to be safe.
      await openEditor(page, request);

      await page.locator('#view-event-table .grid > *').nth(1).click();
      await page.getByRole('button', { name: 'Remove Activity' }).click();

      const focused = page.locator(`${MODAL} :focus`);
      await expect(focused).toHaveCount(1);
      await expect(focused).not.toHaveText(/remove/i);

      // And pressing it leaves the activity alone.
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await expect(page.locator('#view-event-table')).toContainText('Activity 0');
    });
});

// --- Enter submits ----------------------------------------------------------

test.describe('the keyboard', () => {
  // There was not one `<form>` in the entire app. Typing into any field and
  // pressing Enter did nothing at all.

  test('Enter saves an activity', async ({ page, request }) => {
    await openEditor(page, request);

    await page.locator('#view-event-table .grid > *').nth(1).click();
    await page.locator('#activity-label').fill('Renamed By Enter');
    await page.locator('#activity-label').press('Enter');

    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator('#view-event-table')).toContainText('Renamed By Enter');
  });

  test('Enter submits the login form', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Log In' }).click();

    await page.getByLabel('Email Address').fill('nobody@example.com');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByLabel('Password', { exact: true }).press('Enter');

    // It does not matter that the credentials are wrong -- what matters is that
    // Enter did something rather than nothing.
    await expect(page.locator('.notification')).toBeVisible();
  });

  test('Enter runs validation rather than saving nonsense', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Create Event' }).click();

    await page.getByLabel('Event Title').press('Enter');

    await expect(page.locator('#event-title-error')).toBeVisible();
    await expect(page.locator(MODAL)).toBeVisible();
  });
});

// --- focus -------------------------------------------------------------------

test.describe('modal focus', () => {
  // The dialog already claimed `aria-modal="true"`, which tells assistive tech
  // the rest of the page is inert. Nothing made it so: focus stayed wherever it
  // was, Tab walked out into the page behind, and closing left focus on <body>.

  test('moves into the modal when it opens', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Log In' }).click();

    const active = page.locator(':focus');
    await expect(active).toHaveCount(1);
    // Inside the card, not on the page behind it.
    await expect(page.locator(`${MODAL} :focus`)).toHaveCount(1);
  });

  test('stays inside while tabbing', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Log In' }).click();

    // Well past the number of controls in the dialog.
    for (let i = 0; i < 15; i += 1) {
      await page.keyboard.press('Tab');
      await expect(page.locator(`${MODAL} :focus`)).toHaveCount(1);
    }
  });

  test('goes back where it came from when the modal closes', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    const trigger = page.getByRole('link', { name: 'Log In' });
    await trigger.click();
    await expect(page.locator(MODAL)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator(MODAL)).toHaveCount(0);
    // Not <body>, which is where it used to land -- leaving the next Tab to
    // start again from the top of the document.
    await expect(trigger).toBeFocused();
  });
});

// --- names and structure -----------------------------------------------------

test('every slot says which activity and which time it is', async ({ page, request }) => {
  // The grid was a run of identically-named buttons -- "Available, Available,
  // Available" -- with nothing to tell them apart without seeing the table.
  //
  // Driven through the editor because that is where every slot is interactive:
  // in view mode a tile is only a button once there is a volunteer selected and
  // something to toggle, and a name belongs on a control, not on a div.
  await openEditor(page, request, { activities: 2, windows: 2, title: 'Named Slots' });

  const names = await page.locator('#view-event-table button').evaluateAll(
    (els) => els.map((el) => el.getAttribute('aria-label')).filter(Boolean),
  );

  // Two activities across two windows.
  expect(names.length).toBeGreaterThanOrEqual(4);
  // "<activity>, <when>: <state>" -- the two things position was carrying.
  expect(names.filter((n) => /^Activity 0, .+: .+$/.test(n)).length)
    .toBeGreaterThanOrEqual(2);
  // And no two slots are called the same thing.
  expect(new Set(names).size).toBe(names.length);
});

test('the event page has exactly one h1, and it is the title', async ({ page, request }) => {
  const seeded = await seed(request, {
    event: { activities: 1, windows: 1, title: 'Top Level Heading' },
  });
  await page.goto(`/?event=${seeded.eventId}`);
  await waitForApp(page);

  const h1 = page.locator('h1');
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText('Top Level Heading');
});

// --- navigation ---------------------------------------------------------------

test.describe('the navbar', () => {
  test('opening a modal leaves no history entry behind', async ({ page }) => {
    // Every item is an `href="#thing"` anchor, and none of them prevented the
    // default -- so each one pushed `#login`-style junk into history, and Back
    // then walked a trail of fragments that changed nothing visible.
    await page.goto('/');
    await waitForApp(page);

    const before = page.url();
    await page.getByRole('link', { name: 'Log In' }).click();
    await expect(page.locator(MODAL)).toBeVisible();

    expect(page.url()).toBe(before);
  });

  test('the brand goes home without a page load', async ({ page, request }) => {
    // `goHome()` existed and was never called: the brand was a plain href, so
    // the only route back to the dashboard was a full reload.
    await seedSignedIn(page, request);
    const seeded = await seed(request, {
      event: { activities: 1, windows: 1, title: 'Somewhere Else' },
    });
    await page.goto(`/?event=${seeded.eventId}`);
    await waitForApp(page);

    // Marks this document so a full reload is detectable.
    await page.evaluate(() => { window.__stillHere = true; });

    await page.getByRole('link', { name: 'Yasss!' }).click();

    await expect(page).toHaveURL(/\/$|\/\?$/);
    await expect(page.getByText('Your Upcoming Events')).toBeVisible();
    expect(await page.evaluate(() => window.__stillHere)).toBe(true);
  });
});
