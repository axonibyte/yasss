/**
 * Polls, end to end, through the browser.
 *
 * Two things here are worth a browser rather than a unit test.
 *
 * The first is the payload rule. A poll square exists if and only if it is
 * sent -- the opposite of the event slot rule, where omission enables --  so
 * building a grid, publishing it and reading it back is what proves the two
 * files that disagree about this are each right about their own half.
 *
 * The second is the code box. One input resolves both kinds, and the only way
 * to know it does is to type a poll code into the box that has always meant
 * events.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

async function startPoll(page, title = 'Team Lunch') {
  await page.getByRole('link', { name: 'Create Poll' }).click();
  await page.getByLabel('Poll title').fill(title);
  // Two days, so the grid has two columns and one can be withheld.
  await page.getByRole('button', { name: 'Monday' }).click();
  await page.getByRole('button', { name: 'Wednesday' }).click();
  await page.getByRole('button', { name: 'Start building' }).click();
}

async function addTime(page, time) {
  await page.getByRole('button', { name: 'Add a Time' }).click();
  await page.getByLabel('Starts at').fill(time);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

test('Create Poll comes before Create Event in the navbar', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  const items = await page.locator('.navbar-end .navbar-item').allTextContents();
  const poll = items.findIndex((t) => t.includes('Create Poll'));
  const event = items.findIndex((t) => t.includes('Create Event'));
  expect(poll).toBeGreaterThanOrEqual(0);
  expect(poll).toBeLessThan(event);
});

test('builds a poll, publishes it, and offers only the squares it was given',
  async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await startPoll(page);

    await expect(page.getByRole('heading', { name: 'Team Lunch' })).toBeVisible();
    await expect(page.getByText("You haven't added any days or times to your poll yet!"))
      .toBeVisible();

    await addTime(page, '09:00');
    // Corner, two day headers, one time header, two squares.
    await expect(page.locator('.event-cell')).toHaveCount(6);
    await expect(page.locator('[data-slot-state="editing"]')).toHaveCount(2);

    // Withhold one square, then publish and read it back. If presence did not
    // enable, this square would come back offered.
    await page.locator('[data-slot-state="editing"]').first().click();
    await expect(page.locator('[data-slot-state="editing-off"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Publish Poll' }).click();
    await expect(page.getByLabel('Poll URL')).toBeVisible();
    await page.getByRole('button', { name: 'close' }).click();

    await expect(page.locator('[data-slot-state="unavailable"]')).toHaveCount(1);
    await expect(page.locator('[data-slot-state="available"]')).toHaveCount(1);
    await expect(page).toHaveURL(/\?poll=/);
  });

test('the repeat control fills the day and refuses an interval that will not fit',
  async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await startPoll(page);

    await page.getByRole('button', { name: 'Add a Time' }).click();
    await page.getByLabel('Starts at').fill('21:00');
    await page.getByLabel('Repeat through the day').check();

    // Eight hours after nine in the evening runs past midnight, so it is
    // refused rather than quietly making one row.
    await page.getByLabel('Hours').fill('8');
    await expect(page.getByText(/Only 3h 0m is left in the day/)).toBeVisible();

    await page.getByLabel('Hours').fill('1');
    await expect(page.getByTestId('repeat-preview')).toContainText('3 times');

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    // 21:00, 22:00, 23:00 against two days.
    await expect(page.locator('[data-slot-state="editing"]')).toHaveCount(6);
  });


test('the repeat stops at an "until", and offers the time it names',
  async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await startPoll(page);

    await page.getByRole('button', { name: 'Add a Time' }).click();
    await page.getByLabel('Starts at').fill('09:00');
    await page.getByLabel('Repeat through the day').check();
    await page.getByLabel('Hours').fill('1');
    await page.getByLabel('Until').fill('12:00');

    // 09:00, 10:00, 11:00 and -- this is the decision -- 12:00 itself. The
    // organizer typed that time to have it offered; dropping it would read as
    // an off-by-one however the help text explained itself.
    await expect(page.getByTestId('repeat-preview')).toContainText('4 times');
    await expect(page.getByTestId('repeat-preview')).toContainText('12:00 PM');

    // An until before the start is refused, and the complaint lands on the
    // until rather than on the interval -- which is the one number that is
    // right, and where the old single error slot would have pointed.
    await page.getByLabel('Until').fill('08:00');
    await expect(page.getByText(/That is before 09:00/)).toBeVisible();
    await expect(page.getByTestId('repeat-preview')).toBeHidden();

    await page.getByLabel('Until').fill('11:00');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    // 09:00, 10:00, 11:00 against two days.
    await expect(page.locator('[data-slot-state="editing"]')).toHaveCount(6);
  });

test('All Day grays a column and gives it back when unticked', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startPoll(page);
  await addTime(page, '09:00');

  await page.getByTestId('all-day-toggle').first().check();
  await expect(page.locator('[data-slot-state="all-day"]')).toHaveCount(1);

  await page.getByTestId('all-day-toggle').first().uncheck();
  // The square it had is back, rather than needing to be rebuilt.
  await expect(page.locator('[data-slot-state="all-day"]')).toHaveCount(0);
  await expect(page.locator('[data-slot-state="editing"]')).toHaveCount(2);
});

test('the warning about multiple answers says plainly that it is bypassable',
  async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    await page.getByRole('link', { name: 'Create Poll' }).click();
    await expect(page.getByTestId('multi-answer-warning')).toHaveCount(0);

    await page.getByLabel('Allow more than one answer per person').uncheck();
    await expect(page.getByTestId('multi-answer-warning'))
      .toContainText('trivial to bypass');
  });

test('one code box opens a poll as readily as an event', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await startPoll(page, 'Which evening?');
  await addTime(page, '18:00');
  await page.getByRole('button', { name: 'Publish Poll' }).click();

  const code = await page.getByTestId('event-code').inputValue();
  await page.getByRole('button', { name: 'close' }).click();

  // Home, then in through the box that has always meant events.
  await page.locator('.navbar-brand a').first().click();
  await page.getByLabel('Have a code?').fill(code);
  await page.getByRole('button', { name: 'Go' }).click();

  await expect(page.getByRole('heading', { name: 'Which evening?' })).toBeVisible();
  await expect(page).toHaveURL(/\?poll=/);
});

test('answering records one person and as many squares as they like',
  async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await startPoll(page);
    await addTime(page, '09:00');
    await addTime(page, '12:30');
    await page.getByRole('button', { name: 'Publish Poll' }).click();
    await page.getByRole('button', { name: 'close' }).click();

    // Two of the four squares.
    const squares = page.locator('[data-slot-state="available"]');
    await expect(squares).toHaveCount(4);
    await squares.nth(0).click();
    await squares.nth(3).click();
    await expect(page.locator('[data-slot-state="voted"]')).toHaveCount(2);

    await page.getByRole('button', { name: 'Answer This Poll' }).click();
    await page.getByLabel('Your name').fill('Ada');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('You answered as Ada.')).toBeVisible();
    // One person, two votes -- not two respondents.
    await expect(page.getByTestId('poll-results')).toContainText('1 person has answered');
  });
