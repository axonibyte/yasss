/**
 * The two places a poll is treated as though it were an event.
 *
 * Both were found by reading rather than by failing, which is why they are
 * written down here: nothing in the suite asked either question, so nothing
 * noticed. A poll draft lives entirely in the browser until it is published --
 * `poll.persisted` is `id !== null`, and the wizard never assigns one -- so
 * anything that discards it silently discards real work.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

/** Build an unpublished poll: two days, one time, no id anywhere. */
async function draftPoll(page, title = 'Unsaved Poll') {
  await page.getByRole('link', { name: 'Create Poll' }).click();
  await page.getByLabel('Poll title').fill(title);
  await page.getByRole('button', { name: 'Monday' }).click();
  await page.getByRole('button', { name: 'Wednesday' }).click();
  await page.getByRole('button', { name: 'Start building' }).click();
  await page.getByRole('button', { name: 'Add a Time' }).click();
  await page.getByLabel('Starts at').fill('09:00');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

test('going home does not throw an unsaved poll away without asking', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await draftPoll(page);
  await expect(page.getByRole('heading', { name: 'Unsaved Poll' })).toBeVisible();

  // The brand is a real in-app navigation rather than a reload, precisely so
  // that unsaved work survives it -- which is only true if it asks first.
  await page.getByRole('link', { name: 'Yasss! Yasss!' }).click();

  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Backing out leaves the draft exactly where it was, the same promise the
  // tutorial guard makes.
  await expect(page.getByRole('heading', { name: 'Unsaved Poll' })).toBeVisible();
});

test('the anonymous-publish prompt names a poll, not an event', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await draftPoll(page, 'Naming Check');

  await page.getByRole('button', { name: 'Publish Poll' }).click();

  // The prompt is shared with the event flow and used to say "event" whichever
  // one you were publishing, which reads as though the wrong button was
  // pressed at the one moment the decision is irreversible.
  const prompt = page.locator('.modal.is-active');
  await expect(prompt).toContainText(/poll/i);
  await expect(prompt).not.toContainText(/\bevent\b/i);
});
