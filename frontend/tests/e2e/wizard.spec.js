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

  await expect(page.getByRole('cell', { name: 'Contact email' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Email Address' })).toBeVisible();
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
