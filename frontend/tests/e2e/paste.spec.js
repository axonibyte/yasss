/**
 * Pasting, as distinct from typing.
 *
 * Nothing in the app has an `onpaste` handler, which makes it easy to assume
 * the two are the same. They are not, for any input whose handler cares about
 * the *sequence* of `input` events rather than the final value: typing "1000"
 * produces four of them with valid intermediates, a paste produces one, and
 * `change` does not arrive until the field is left.
 *
 * Two real defects lived in that gap and are fixed here; one deliberate
 * behavior lives there too and is pinned rather than changed. See
 * `tests/shared/paste.js` for why `keyboard.insertText` is the only honest way
 * to reproduce a paste across engines.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';
import { pasteInto } from '../shared/paste.js';

async function openActivityModal(page) {
  await page.goto('/');
  await waitForApp(page);
  await page.getByRole('link', { name: 'Create Event' }).click();
  await page.locator('#event-title').fill('Bake Sale');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Add an Activity' }).click();
  await page.locator('#activity-label').fill('Setup');
  // The cap inputs only exist once "unlimited" is off.
  await page.locator('label[for="activity-slot-cap-unlimited"]').click();
}

test.describe('the volunteer cap field', () => {
  /**
   * Pinned, not fixed — and narrower than it looks.
   *
   * The input is one-way (`value={capped}`), so whenever clamping *changes*
   * `capped` Svelte re-renders and the box corrects itself immediately: pasting
   * "1000" shows 255 straight away. The window exists only when clamping leaves
   * `capped` where it already was, because then Svelte sees no state change and
   * leaves the box displaying what was typed. Pasting "0" into a field already
   * at the minimum is exactly that case, and it is why `onCommit` exists.
   */
  test('corrects itself immediately when the clamped value changes', async ({ page }) => {
    await openActivityModal(page);
    const cap = page.locator('#activity-slot-cap');

    await pasteInto(page, cap, '1000');
    await expect(cap).toHaveValue('255');
  });

  test('snaps on blur when clamping left the value unchanged', async ({ page }) => {
    await openActivityModal(page);
    const cap = page.locator('#activity-slot-cap');

    await cap.fill('1');
    // Clamps back to 1, which it already was — so nothing re-renders and the
    // box goes on showing the 0 that will not be saved.
    await pasteInto(page, cap, '0');
    await expect(cap).toHaveValue('0');

    await cap.blur();
    await expect(cap).toHaveValue('1');
  });

  /**
   * Fixed. A number input reports '' for anything it cannot parse, `Number('')`
   * is 0, and clamping 0 up to the minimum turned pasted garbage into a silent
   * 1 — no error, and nothing on screen to explain where the number came from.
   */
  test('ignores unparseable text rather than silently becoming 1', async ({ page }) => {
    await openActivityModal(page);
    const cap = page.locator('#activity-slot-cap');

    await cap.fill('12');
    await pasteInto(page, cap, 'abc');
    await cap.blur();

    expect(await cap.inputValue()).toBe('12');
  });

  test('still allows an ordinary clear-and-retype', async ({ page }) => {
    // The control case for the fix above: an early return on empty input must
    // not make the field impossible to edit.
    await openActivityModal(page);
    const cap = page.locator('#activity-slot-cap');

    await cap.fill('12');
    await cap.fill('');
    await cap.pressSequentially('7');
    await cap.blur();

    await expect(cap).toHaveValue('7');
  });
});

test.describe('the reminder lead time', () => {
  /**
   * Fixed. The field was `type="number"` with a Svelte binding, so anything the
   * browser could not parse arrived as blank — and blank means "use the
   * platform default". Pasting `1440abc` saved the default and said nothing.
   */
  test('refuses a value it cannot parse instead of quietly using the default',
    async ({ page }) => {
      await page.goto('/');
      await waitForApp(page);
      await page.getByRole('link', { name: 'Create Event' }).click();
      await page.locator('#event-title').fill('Bake Sale');

      await pasteInto(page, page.locator('#event-lead-time'), '1440abc');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.locator('#event-lead-time-error')).toBeVisible();
      await expect(page.locator('#event-lead-time-error')).toContainText('525600');
      // Still open, so the value can be corrected rather than lost.
      await expect(page.locator('#event-lead-time')).toBeVisible();
    });

  test('accepts a plain number', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Create Event' }).click();
    await page.locator('#event-title').fill('Bake Sale');

    await pasteInto(page, page.locator('#event-lead-time'), '1440');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { name: 'Bake Sale' })).toBeVisible();
  });
});

test.describe('the slot cap', () => {
  /**
   * Rewritten, because the field changed rather than the expectation.
   *
   * `SlotModal` used to hand-roll its own switch and number box, and so lost
   * both of the things `CapField` exists for: the paste guard that stops a
   * pasted word becoming a silent 1, and the blur snap-back that stops the box
   * showing a number different from the one that will be saved. It reuses the
   * component now, so an unparseable paste never reaches validation at all --
   * there is no error to report because there is no bad value.
   */
  async function openSlotModal(page) {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('link', { name: 'Create Event' }).click();
    await page.locator('#event-title').fill('Bake Sale');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Add an Activity' }).click();
    await page.locator('#activity-label').fill('Setup');
    await page.getByRole('button', { name: 'Save Activity' }).click();
    await page.getByRole('button', { name: 'Add a Window' }).click();
    await page.getByRole('button', { name: 'Save Window' }).click();

    // The last cell is a slot; the first is the activity header, which opens a
    // different editor entirely.
    await page.locator('#view-event-table .grid > *').last().locator('button').click();
    await expect(page.locator('.modal-card-title')).toContainText('Slot');
    // The cap only renders once the slot is limited.
    await page.locator('label[for="slot-cap-unlimited"]').click();
  }

  test('keeps the last good value rather than accepting a pasted word',
    async ({ page }) => {
      await openSlotModal(page);
      const cap = page.locator('#slot-cap');

      await cap.fill('4');
      await pasteInto(page, cap, 'abc');
      await cap.blur();

      // Not 1, which is what `Number('') -> 0 -> clamp` used to produce, and
      // not a validation error either: the value never went bad.
      await expect(cap).toHaveValue('4');
    });

  test('clamps an over-large paste the way every other cap does',
    async ({ page }) => {
      await openSlotModal(page);
      const cap = page.locator('#slot-cap');

      await pasteInto(page, cap, '1000');
      await expect(cap).toHaveValue('255');
    });

  test('saves the number the box is showing', async ({ page }) => {
    await openSlotModal(page);
    const cap = page.locator('#slot-cap');

    await cap.fill('3');
    await page.getByRole('button', { name: 'Update Slot' }).click();

    await expect(page.locator('.modal-card')).toHaveCount(0);
  });
});

test.describe('email normalization', () => {
  /**
   * Addresses are lowercased on blur so the user can see it happen, but every
   * validator normalizes independently — so submitting without ever leaving the
   * field has to be safe too. A dispatched click does not move focus, which is
   * what makes this test the one that would catch a "simplify the validators"
   * refactor.
   */
  test('a pasted uppercase address is sent lowercased even without blurring',
    async ({ page }) => {
      await page.goto('/');
      await waitForApp(page);
      await page.getByRole('link', { name: 'Log In' }).click();

      await pasteInto(page, page.locator('#auth-email'), 'ADA@EXAMPLE.COM');
      await page.locator('#auth-password').fill('hunter2!');

      const posted = page.waitForRequest(
        (r) => r.url().includes('/v1') && r.method() === 'GET',
      );
      await page.getByRole('button', { name: 'Log In!' }).dispatchEvent('click');
      await posted;

      // A dispatched click moves no focus, so the onblur normalizer never runs.
      // The address is lowercased anyway, because `validateLogin` normalizes
      // independently and the modal writes the normalized value back — which is
      // the property worth pinning, since the blur handler exists only so the
      // user can watch it happen.
      expect(await page.locator('#auth-email').inputValue()).toBe('ada@example.com');
    });
});
