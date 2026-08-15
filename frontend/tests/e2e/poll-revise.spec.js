/**
 * Changing an answer you already gave.
 *
 * Worth a browser rather than a unit test for the same reason submitting is:
 * the interesting part is what the page knows afterwards. A revision must move
 * the counts without inventing a second respondent, and the reader has to see
 * that happen without reloading -- the counts are only re-read because the
 * client goes and asks, and nothing in a unit test would notice if it stopped.
 *
 * The anonymous path is the one covered here deliberately. A signed-in
 * respondent is identified by their account; an anonymous one holds a single
 * edit token, issued once in the reply to their submission, and it is the only
 * thing standing between "change my answer" and "change somebody's answer".
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

/** A published two-by-two poll: two days, two times, four votable squares. */
async function publishedPoll(page, title = 'Revision Poll') {
  await page.getByRole('link', { name: 'Create Poll' }).click();
  await page.getByLabel('Poll title').fill(title);
  await page.getByRole('button', { name: 'Monday' }).click();
  await page.getByRole('button', { name: 'Wednesday' }).click();
  await page.getByRole('button', { name: 'Start building' }).click();

  for (const at of ['09:00', '12:30']) {
    await page.getByRole('button', { name: 'Add a Time' }).click();
    await page.getByLabel('Starts at').fill(at);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }

  await page.getByRole('button', { name: 'Publish Poll' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await page.getByRole('button', { name: 'close' }).click();
}

test('revising an answer moves the votes without adding a respondent',
  async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await publishedPoll(page);

    // One square, one person.
    const available = page.locator('[data-slot-state="available"]');
    await expect(available).toHaveCount(4);
    await available.first().click();
    await expect(page.locator('[data-slot-state="voted"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Answer This Poll' }).click();
    await page.getByLabel('Your name').fill('Ada');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('You answered as Ada.')).toBeVisible();
    await expect(page.getByTestId('poll-results')).toContainText('1 person has answered');

    // Now change it: claim a second square and send it again.
    await page.locator('[data-slot-state="available"]').first().click();
    await expect(page.locator('[data-slot-state="voted"]')).toHaveCount(2);

    await page.getByRole('button', { name: 'Update Your Answer' }).click();
    // `Update`, not `Submit`: the modal names the action it is about to take,
    // and it knows it is revising because an existing response was handed to it.
    await page.getByRole('button', { name: 'Update', exact: true }).click();

    // Still Ada, still one respondent. A revision that quietly became a second
    // answer would read as two people agreeing, which is the whole thing a poll
    // is being asked to measure.
    await expect(page.getByText('You answered as Ada.')).toBeVisible();
    await expect(page.getByTestId('poll-results')).toContainText('1 person has answered');
    await expect(page.getByTestId('poll-results')).not.toContainText('2 people have answered');

    // And the second vote is on screen without a reload, which only happens
    // because the client re-reads the poll after a revision.
    await expect(page.locator('[data-slot-state="voted"]')).toHaveCount(2);
  });
