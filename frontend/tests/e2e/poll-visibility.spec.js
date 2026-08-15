/**
 * Who is allowed to see the counts, from the reader's side.
 *
 * `PollResultVisibilityTest` covers the rule as a pure function and the e2e
 * stage proves the server omits the tally rather than hiding it. Neither can
 * see the thing a respondent actually experiences: that the results are not
 * there, and then are, and that the change happens because they answered rather
 * than because they reloaded.
 *
 * The default for an anonymous creator is RESPONDENT_ALL_AFTER_SUBMIT, so this
 * is the path almost every poll made without an account will take.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

test('results appear when the reader answers, not before', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await page.getByRole('link', { name: 'Create Poll' }).click();
  await page.getByLabel('Poll title').fill('Visibility Poll');
  await page.getByRole('button', { name: 'Monday' }).click();
  await page.getByRole('button', { name: 'Wednesday' }).click();
  await page.getByRole('button', { name: 'Start building' }).click();

  await page.getByRole('button', { name: 'Add a Time' }).click();
  await page.getByLabel('Starts at').fill('09:00');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.modal.is-active')).toHaveCount(0);

  await page.getByRole('button', { name: 'Publish Poll' }).click();
  await page.getByRole('button', { name: "No thanks, I'm good!" }).click();
  await page.getByRole('button', { name: 'close' }).click();

  // Nothing yet. The reader has not answered, so under the default setting the
  // server discloses no tally and there is nothing to render.
  await expect(page.getByTestId('poll-results')).toHaveCount(0);

  await page.locator('[data-slot-state="available"]').first().click();
  await page.getByRole('button', { name: 'Answer This Poll' }).click();
  await page.getByLabel('Your name').fill('Ada');
  await page.getByRole('button', { name: 'Submit' }).click();

  // And now they are there, without a reload. The reply to an answer does not
  // carry the tally, so this only happens because the client goes back and asks
  // -- which it did not always do.
  await expect(page.getByTestId('poll-results')).toBeVisible();
  await expect(page.getByTestId('poll-results')).toContainText('1 person has answered');
});
