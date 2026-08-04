/**
 * Harness for the input-fuzzing specs, against the real stack.
 *
 * Two things here earn their keep.
 *
 * The first is the watchdog. Every spec runs with a listener for uncaught
 * exceptions, unhandled rejections and 5xx responses, and any of them fails the
 * test that provoked it. That is the oracle the API fuzzer already uses, moved
 * up a tier: we are not asserting that every input produces the right answer,
 * only the cheaper and more general "nothing crashes, and the server is never
 * asked to do something it will refuse".
 *
 * The second is `classifySave`. A form submission has exactly three acceptable
 * outcomes — accepted, refused with a message next to the field, or refused
 * with the server's message in a toast — and one unacceptable one: nothing
 * happens at all. A modal that stays open with no explanation is the failure
 * mode the legacy shipped (behavior §3.8), so it is worth a named verdict
 * rather than a timeout somewhere further down the test.
 */
import { test as base, expect } from '@playwright/test';

export { expect };

/** App modals carry a `.modal-card`; bulma-calendar's own wrapper does not. */
export const MODAL = '.modal.is-active:has(.modal-card)';

/**
 * The base test, with the watchdog installed.
 *
 * `pageerror` covers synchronous throws. Unhandled rejections do not surface
 * there on their own, so they are rethrown from a macrotask, which does.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', (e) => {
        const reason = e.reason?.stack || e.reason?.message || String(e.reason);
        setTimeout(() => { throw new Error(`unhandledrejection: ${reason}`); });
      });
    });

    const pageErrors = [];
    const serverErrors = [];

    page.on('pageerror', (err) => pageErrors.push(err.stack || err.message));
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    });

    await use(page);

    // Reported together so one run names every problem it saw, not just the
    // first. Both lists are almost always empty, so this costs nothing.
    const problems = [
      ...pageErrors.map((e) => `uncaught: ${e}`),
      ...serverErrors.map((e) => `server 5xx: ${e}`),
    ];
    expect(problems, 'the page threw or the server 5xx-ed').toEqual([]);
  },
});

/** Past the deliberate minimum splash. */
export async function ready(page) {
  await page.waitForSelector('.pageloader:not(.is-active)', { timeout: 30_000 });
}

/** Buttons scoped to the open app modal, so bulma-calendar's Save never wins. */
export const modalButton = (page, name) =>
  page.locator(MODAL).getByRole('button', { name, exact: true });

/**
 * Toasts linger for five seconds and would otherwise be read as the *next*
 * case's verdict. They dismiss on click.
 */
export async function clearToasts(page) {
  const toasts = page.locator('.notification');
  for (let i = await toasts.count(); i > 0; i -= 1) {
    await toasts.first().click({ timeout: 1000 }).catch(() => {});
  }
  await expect(page.locator('.notification')).toHaveCount(0, { timeout: 7000 });
}

/**
 * Strip the "Error" pill's text off an inline message.
 *
 * `Field` renders the pill as the first child of the same `<p class="help">`
 * that carries the message, so `innerText` returns "Error <the message>".
 * Without this every assertion failure in the fuzz specs would read
 * "Error Error ..." and the pill would count toward substring matches.
 */
const helpText = (raw) => raw.replace(/^\s*Error\s*/, '').trim();

/**
 * Press a modal's save button and say what happened.
 *
 * @returns {Promise<{outcome: 'accepted'|'rejected'|'server-rejected'|'silent', message: string}>}
 */
export async function classifySave(page, buttonName, { timeout = 15_000 } = {}) {
  const modal = page.locator(MODAL);
  const inline = modal.locator('p.help.is-danger');
  const toast = page.locator('.notification.is-danger');

  await modalButton(page, buttonName).click();

  // Destructive actions ask before they act. The confirmation replaces the
  // editor rather than stacking on it, and its destructive button carries the
  // same label as the one that opened it -- so pressing that label again is
  // exactly what a user does, and what the caller means by "remove it".
  const confirmation = page.locator('[data-testid="confirm-detail"]');
  if (await confirmation.count() > 0) await modalButton(page, buttonName).click();

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await modal.count() === 0) return { outcome: 'accepted', message: '' };
    if (await inline.count() > 0) {
      return { outcome: 'rejected', message: helpText(await inline.first().innerText()) };
    }
    if (await toast.count() > 0) {
      return { outcome: 'server-rejected', message: (await toast.first().innerText()).trim() };
    }
    await page.waitForTimeout(80);
  }
  return { outcome: 'silent', message: '' };
}

/**
 * Put a value in a field the way a user would.
 *
 * `fill` is fast and works for anything a text input will hold. A number input
 * refuses malformed values outright, and Playwright reports that rather than
 * typing it, so those fall back to real keystrokes — which is what a user does
 * anyway, and lets the browser drop the characters it will not accept.
 */
export async function typeInto(locator, value) {
  try {
    await locator.fill(value);
  } catch {
    await locator.fill('');
    if (value !== '') await locator.pressSequentially(value, { delay: 0 });
  }
}

/**
 * Flip a Bulma switch.
 *
 * The checkbox itself is visually hidden and its `<label>` is drawn on top, so
 * clicking the input is always intercepted. Clicking the label is both what a
 * user does and the only thing that works.
 */
export async function toggleSwitch(page, id) {
  await page.locator(`label[for="${id}"]`).click();
}

/** Drive a Bulma switch to a known state rather than just flipping it. */
export async function setSwitch(page, id, checked) {
  const box = page.locator(`#${id}`);
  if (await box.isChecked() !== checked) await toggleSwitch(page, id);
  await expect(box).toBeChecked({ checked });
}

/** Dismiss whatever modal is open, if any. */
export async function closeModal(page) {
  const close = page.locator(`${MODAL} button.delete`);
  if (await close.count()) await close.first().click();
  await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Run one input case and return its verdict, leaving no modal open either way.
 *
 * Every fuzz loop needs the same three steps — drive the form, classify, tidy
 * up — and getting the tidy-up wrong is what makes a loop's second iteration
 * fail for reasons that have nothing to do with its input.
 */
export async function runCase(page, { open, fill, save }) {
  await open();
  await fill();
  const verdict = await classifySave(page, save);
  if (verdict.outcome !== 'accepted') await closeModal(page);
  await clearToasts(page);
  return verdict;
}

// --- building events -------------------------------------------------------

/** A title that is unique per call, so nothing collides across specs. */
export const uniqueTitle = (prefix) =>
  `${prefix} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Start the creation wizard and get past step one.
 *
 * Leaves the event in CREATE mode: nothing is persisted, so the structural
 * modals can be opened and closed as fast as the browser will go.
 */
export async function startWizard(page, title = uniqueTitle('Fuzz')) {
  await page.goto('/');
  await ready(page);
  await page.getByRole('link', { name: 'Create Event' }).click();
  await expect(page.locator(MODAL)).toHaveCount(1);
  // Located by id rather than label throughout. The original reason — `Field`
  // putting a button inside the `<label>`, which changed the accessible name
  // the moment a field errored — is fixed, so `getByLabel` would work again.
  // Ids stay because copy is not a contract and because this corpus contains
  // values that collide with label text on purpose.
  await page.locator('#event-title').fill(title);
  await modalButton(page, 'Save').click();
  await expect(page.locator(MODAL)).toHaveCount(0);
  return title;
}

/** Add an activity in whatever mode the event is in. */
export async function addActivity(page, label) {
  await page.getByRole('button', { name: 'Add an Activity' }).click();
  await page.locator('#activity-label').fill(label);
  const verdict = await classifySave(page, 'Save Activity');
  expect(verdict.outcome, `adding activity "${label}": ${verdict.message}`).toBe('accepted');
}

/** Add a window, accepting the picker's default range. */
export async function addWindow(page) {
  await page.getByRole('button', { name: 'Add a Window' }).click();
  const verdict = await classifySave(page, 'Save Window');
  expect(verdict.outcome, `adding window: ${verdict.message}`).toBe('accepted');
}

/** Add a custom field. */
export async function addDetail(page, { type, label, hint = '', required = false }) {
  await page.getByRole('button', { name: 'Add a Field' }).click();
  await page.locator('#detail-type').selectOption(type);
  await page.locator('#detail-label').fill(label);
  if (hint) await page.locator('#detail-hint').fill(hint);
  // A Bulma switch: the label covers the box, so `check()` never lands.
  if (required) await setSwitch(page, 'detail-required', true);
  const verdict = await classifySave(page, 'Save Detail');
  expect(verdict.outcome, `adding detail "${label}": ${verdict.message}`).toBe('accepted');
}

/**
 * Publish the event under construction and return its id.
 *
 * Anonymous by default — the path with no account behind it, which is the one
 * most likely to be under-tested.
 */
export async function publish(page) {
  await page.getByRole('button', { name: 'Publish Event' }).click();
  const guest = page.getByRole('button', { name: "No thanks, I'm good!" });
  if (await guest.count()) await guest.click();
  await expect(page.getByText('Successfully created your event!')).toBeVisible({ timeout: 20_000 });
  await page.waitForURL(/\?event=/, { timeout: 20_000 });
  // Publishing reloads the event and *then* opens the share modal, so it lands
  // a moment after the URL changes. Waiting for it rather than polling once is
  // the difference between dismissing it and having it appear later, on top of
  // whatever the test does next -- as a full-page overlay that swallows clicks.
  await expect(page.locator(MODAL)).toHaveCount(1, { timeout: 20_000 });
  await closeModal(page);
  return new URL(page.url()).searchParams.get('event');
}

/** A published event with one activity and one window, ready to RSVP against. */
export async function publishMinimalEvent(page, prefix = 'Fuzz') {
  const title = await startWizard(page, uniqueTitle(prefix));
  await addActivity(page, 'Setup');
  await addWindow(page);
  const id = await publish(page);
  return { id, title };
}

/** Reopen a published event as a fresh visitor. */
export async function visitEvent(page, eventId) {
  await page.goto(`/?event=${eventId}`);
  await ready(page);
  await expect(page.locator('#view-event-table')).toBeVisible();
}

/** Sign in as the bootstrap administrator the suite registers. */
export async function signInAsAdmin(page) {
  await page.getByRole('link', { name: 'Log In' }).click();
  await page.locator('#auth-email')
    .fill(process.env.YASSS_ADMIN_EMAIL ?? 'e2e-admin@example.com');
  await page.locator('#auth-password')
    .fill(process.env.YASSS_ADMIN_PASSWORD ?? 'e2e-admin-password');
  // Real key derivation runs scrypt at N=16384 in the browser, which is seconds
  // rather than milliseconds -- there is no seeding backdoor on the real stack.
  await modalButton(page, 'Log In!').click();
  await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 60_000 });
}

// --- the window picker -----------------------------------------------------

/** Open bulma-calendar's dialog from the window modal. */
export async function openPicker(page) {
  await page.locator(`${MODAL} .datetimepicker-dummy-wrapper`).first().click({ force: true });
  await expect(page.locator('.datetimepicker.is-active')).toHaveCount(1, { timeout: 15_000 });
}

/**
 * Nudge one of the picker's four time spinners.
 *
 * `which` is 'start' or 'end', `unit` is 'hours' or 'minutes'. Positive steps
 * press +, negative press -. This is the only route to an inverted range that a
 * user actually has: the date cells normalise start/end between them, but the
 * clocks are independent, so a same-day window can be given an end before its
 * beginning.
 */
export async function nudgeTime(page, which, unit, steps) {
  const spinner = page.locator(`.datetimepicker.is-active .timepicker-${which} .timepicker-${unit}`);
  const button = spinner.locator(steps > 0 ? '.timepicker-next' : '.timepicker-previous');
  for (let i = 0; i < Math.abs(steps); i += 1) await button.click();
}

/**
 * Commit the picker dialog and make sure it is out of the way.
 *
 * bulma-calendar only hides on validate when it considers the range valid, and
 * its dialog is a full-screen overlay — so an un-dismissed picker silently
 * blocks every button on the modal underneath it. Dismissing explicitly keeps a
 * failure about the range from arriving disguised as a click timeout.
 */
export async function savePicker(page) {
  const dialog = page.locator('.datetimepicker.is-active');
  await dialog.locator('.datetimepicker-footer-validate').click();
  if (await dialog.count()) {
    await page.locator('.datetimepicker-wrapper .modal-background').first().click({ force: true });
  }
  await expect(dialog).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Wipe the range using the clear affordance on the field itself.
 *
 * Deliberately not the one inside the dialog: this one needs no dialog open, so
 * there is no overlay left covering the modal afterwards. Both are bound to the
 * same handler, which clears and then emits `save` — which is what publishes
 * the now-empty range to the component's binding.
 */
export async function clearPicker(page) {
  await page.locator(`${MODAL} .datetimepicker-clear-button`).click();
}
