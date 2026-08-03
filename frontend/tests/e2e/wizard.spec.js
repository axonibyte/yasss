/**
 * The creation wizard, end to end — docs/legacy/01-behavior.md §1.5.
 *
 * The slot round-trip is the point. The server creates a slot for every
 * (activity, window) pair unless an explicit enabled:false suppresses it, so a
 * payload that merely *omits* a disabled slot silently turns it on. The legacy
 * walked its slot array with the wrong stride and did exactly that. Publishing
 * here and reading the event back is what proves the payload is right.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

/** Walk the summary step, which is where the wizard starts. */
async function startEvent(page, title = 'Fun Run') {
  await page.getByRole('link', { name: 'Create Event' }).click();
  await page.getByLabel('Event Title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();
}

async function addActivity(page, label) {
  await page.getByRole('button', { name: 'Add an Activity' }).click();
  await page.getByLabel('Activity', { exact: true }).fill(label);
  await page.getByRole('button', { name: 'Save Activity' }).click();
}

test('builds an event and shows the empty grid first', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startEvent(page);

  await expect(page.getByRole('heading', { name: 'Fun Run' })).toBeVisible();
  await expect(page.getByText("You haven't added any windows or activities to your event yet!"))
    .toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish Event' })).toBeVisible();
});

test('adding activities grows the grid', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startEvent(page);

  await addActivity(page, 'Setup');
  await expect(page.locator('.fixed-grid.has-2-cols')).toBeVisible();

  await addActivity(page, 'Cleanup');
  await expect(page.locator('.fixed-grid.has-3-cols')).toBeVisible();

  await expect(page.locator('.event-cell li').filter({ hasText: /^Setup$/ })).toBeVisible();
  await expect(page.locator('.event-cell li').filter({ hasText: /^Cleanup$/ })).toBeVisible();
});

test('caps the grid at five columns and pages the rest', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startEvent(page);

  for (const label of ['A', 'B', 'C', 'D', 'E']) await addActivity(page, label);

  await expect(page.locator('.fixed-grid.has-5-cols')).toBeVisible();
  const slider = page.locator('#view-event-slider');
  await expect(slider).toBeVisible();
  // 5 activities, 4 visible at a time
  await expect(slider).toHaveAttribute('max', '2');

  // The first page shows the first four; the legacy's refresh dropped the step
  // and snapped back here while the thumb stayed put.
  await expect(page.locator('.event-cell li').filter({ hasText: /^E$/ })).toHaveCount(0);
  await slider.fill('2');
  await expect(page.locator('.event-cell li').filter({ hasText: /^E$/ })).toHaveCount(1);
  await expect(page.locator('.event-cell li').filter({ hasText: /^A$/ })).toHaveCount(0);
});

test('the custom-fields table replaces the volunteer picker while editing', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startEvent(page);

  // Preserved legacy behavior: volunteers never see this table, and organizers
  // never see the volunteer picker while building.
  await expect(page.getByText('Custom Fields', { exact: true })).toBeVisible();
  await expect(page.getByText('Volunteer!')).toHaveCount(0);
  await expect(page.getByText("You haven't specified any custom fields yet! :)")).toBeVisible();

  await page.getByRole('button', { name: 'Add a Field' }).click();
  await page.getByLabel('Type').selectOption('EMAIL');
  await page.getByLabel('Field').fill('Contact email');
  await page.getByRole('button', { name: 'Save Detail' }).click();

  await expect(page.getByRole('cell', { name: 'Contact email', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Email Address', exact: true })).toBeVisible();
});

test('publishing round-trips the event, and lands on its share link', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startEvent(page, 'Charity Drive');
  await addActivity(page, 'Setup');

  await page.getByRole('button', { name: 'Publish Event' }).click();

  // Anonymous publish means never being able to edit it, so the app says so.
  await expect(page.getByText('Hey there friend!')).toBeVisible();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();

  await expect(page.getByText('Successfully created your event!')).toBeVisible();
  await expect(page).toHaveURL(/\?event=event-\d+/);
  await expect(page.getByLabel('Event URL')).toBeVisible();
});

test('a published event reloads with the activities it was given', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startEvent(page, 'Reload Me');
  await addActivity(page, 'Setup');
  await addActivity(page, 'Cleanup');

  await page.getByRole('button', { name: 'Publish Event' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await expect(page.getByText('Successfully created your event!')).toBeVisible();

  await page.reload();
  await waitForApp(page);

  await expect(page.getByRole('heading', { name: 'Reload Me' })).toBeVisible();
  await expect(page.locator('.event-cell li').filter({ hasText: /^Setup$/ })).toBeVisible();
  await expect(page.locator('.event-cell li').filter({ hasText: /^Cleanup$/ })).toBeVisible();
});

test('a blank title is refused before anything is sent', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await page.getByRole('link', { name: 'Create Event' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('The title of your event cannot be blank.')).toBeVisible();
});

test('a slot disabled in the wizard stays disabled after publishing', async ({ page }) => {
  // The assertion this file's header says it exists for, and did not make.
  // The server creates a slot for any (activity, window) pair the payload does
  // not explicitly disable, so an omission silently switches a slot back on.
  await page.goto('/');
  await waitForApp(page);
  await startEvent(page, 'Disabled Slot Survives');

  await addActivity(page, 'Setup');
  await page.getByRole('button', { name: 'Add a Window' }).click();
  await page.getByRole('button', { name: 'Save Window' }).click();
  await expect(page.locator('.modal.is-active')).toHaveCount(0);

  await page.locator('.event-cell li').filter({ hasText: /^Available$/ }).click();
  await page.getByText('Enable this slot?').click();
  await page.getByRole('button', { name: 'Update Slot' }).click();
  await expect(page.locator('.event-cell li').filter({ hasText: /^Unavailable$/ })).toHaveCount(1);

  await page.getByRole('button', { name: 'Publish Event' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await expect(page.getByText('Successfully created your event!')).toBeVisible();

  await page.reload();
  await waitForApp(page);
  await expect(page.locator('.event-cell li').filter({ hasText: /^Unavailable$/ })).toHaveCount(1);
  await expect(page.locator('.event-cell li').filter({ hasText: /^Available$/ })).toHaveCount(0);
});

test('a window added in the wizard is enabled for every activity', async ({ page }) => {
  // The CREATE-side counterpart of edit mode's disabled-by-default rule. These
  // two branches diverging is precisely the legacy failure structureActions
  // was written to prevent.
  await page.goto('/');
  await waitForApp(page);
  await startEvent(page, 'Wizard Window');

  await addActivity(page, 'A');
  await addActivity(page, 'B');
  await page.getByRole('button', { name: 'Add a Window' }).click();
  await page.getByRole('button', { name: 'Save Window' }).click();

  await expect(page.locator('.event-cell li').filter({ hasText: /^Available$/ })).toHaveCount(2);
});

test('deleting an activity in the wizard sends nothing', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startEvent(page, 'Local Only');
  await addActivity(page, 'Doomed');

  const calls = [];
  page.on('request', (r) => { if (r.url().includes('/activities')) calls.push(r.url()); });

  await page.locator('.event-cell li').filter({ hasText: /^Doomed$/ }).click();
  await page.getByRole('button', { name: 'Remove Activity' }).click();

  await expect(page.locator('.event-cell li').filter({ hasText: /^Doomed$/ })).toHaveCount(0);
  // Nothing exists server-side until publish, so there is nothing to delete.
  expect(calls).toEqual([]);
});

test('publishing anonymously leaves the event unowned', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startEvent(page, 'Unowned');
  await addActivity(page, 'Setup');
  await page.getByRole('button', { name: 'Publish Event' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await expect(page.getByText('Successfully created your event!')).toBeVisible();

  await page.reload();
  await waitForApp(page);
  // The warning in the guest prompt is true: there is no way back in.
  await expect(page.getByRole('button', { name: 'Modify Event' })).toHaveCount(0);
});
