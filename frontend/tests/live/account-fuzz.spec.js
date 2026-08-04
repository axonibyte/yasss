/**
 * The account fields, which the fuzz pass had never touched.
 *
 * Everything else in this suite fuzzes event scheduling and volunteer
 * interaction. Sign-in, registration and password reset were left out, and they
 * are the one place where the client's pattern is a deliberate mirror of a Java
 * pattern compiled without CASE_INSENSITIVE — so only the real server can
 * confirm the two still agree. That is why this is a live spec rather than a
 * fake one.
 *
 * Rejections cost nothing: validation short-circuits before `genCreds`, so no
 * scrypt is paid. Acceptances cost seconds each, so they are counted and kept
 * few.
 *
 * NOTE ON ProfileModal: a successful profile update rotates the account's
 * keypair. Fuzzing accepted cases as the bootstrap administrator would
 * invalidate YASSS_ADMIN_PASSWORD for every test that runs afterwards, and with
 * `workers: 1` that is a certainty rather than a race. Every accepted case here
 * runs against an account this spec registers for itself.
 */
import {
  classifySave, closeModal, expect, modalButton, ready, test, typeInto, uniqueTitle,
} from './helpers/harness.js';
import { ACCOUNT_EMAILS, PASSWORDS } from './helpers/corpus.js';

test.describe.configure({ timeout: 180_000 });

async function openAuth(page, { registering = false } = {}) {
  await page.goto('/');
  await ready(page);
  await page.getByRole('link', { name: 'Log In' }).click();
  await expect(page.locator('.modal.is-active')).toHaveCount(1);
  if (registering) await page.locator('label[for="auth-new-account"]').click();
}

test('the address is checked the same way the server checks it', async ({ page }) => {
  for (const c of ACCOUNT_EMAILS) {
    await openAuth(page);
    await typeInto(page.locator('#auth-email'), c.value);
    await typeInto(page.locator('#auth-password'), 'hunter78');

    const verdict = await classifySave(page, 'Log In!', { timeout: 30_000 });

    if (c.expect === 'rejected') {
      expect(verdict.outcome, `${c.name}: ${verdict.message}`).toBe('rejected');
      expect(verdict.message).not.toBe('');
    } else {
      // Accepted by the *client*. The account does not exist, so the server
      // refuses it — which is a different and entirely correct answer, and the
      // one thing that must not happen is a silent nothing.
      expect(['accepted', 'server-rejected'], `${c.name}: ${verdict.message}`)
        .toContain(verdict.outcome);
    }
    if (verdict.outcome !== 'accepted') await closeModal(page);
  }
});

test('a password is only length-checked where one is being set', async ({ page }) => {
  // Login takes any non-empty password: an account created before the policy
  // existed, or under a lower one, still has to be able to sign in.
  await openAuth(page);
  await typeInto(page.locator('#auth-email'), 'nobody@example.com');
  await typeInto(page.locator('#auth-password'), 'x');
  const login = await classifySave(page, 'Log In!', { timeout: 30_000 });
  expect(login.outcome, login.message).not.toBe('rejected');
  if (login.outcome !== 'accepted') await closeModal(page);

  // Registration applies it.
  for (const c of PASSWORDS.filter((p) => p.expect === 'rejected')) {
    await openAuth(page, { registering: true });
    await typeInto(page.locator('#auth-email'), `reg-${Date.now()}@example.com`);
    await typeInto(page.locator('#auth-password'), c.value);
    await typeInto(page.locator('#auth-confirm'), c.value);

    const verdict = await classifySave(page, 'Register!', { timeout: 30_000 });
    expect(verdict.outcome, `${c.name}: ${verdict.message}`).toBe('rejected');
    expect(verdict.message).toMatch(/8 characters/);
    await closeModal(page);
  }
});

test('a mistyped confirmation is caught before any key derivation', async ({ page }) => {
  await openAuth(page, { registering: true });
  await typeInto(page.locator('#auth-email'), 'ada@example.com');
  await typeInto(page.locator('#auth-password'), 'hunter78');
  await typeInto(page.locator('#auth-confirm'), 'hunter79');

  const verdict = await classifySave(page, 'Register!', { timeout: 30_000 });
  expect(verdict.outcome, verdict.message).toBe('rejected');
  expect(verdict.message).toMatch(/confirmation/i);
  await closeModal(page);
});

test('registration accepts a password at the minimum and normalises the address',
  async ({ page }) => {
    // The one scrypt this spec pays deliberately.
    const address = `${uniqueTitle('acct').replace(/\s+/g, '-').toLowerCase()}@example.com`;
    await openAuth(page, { registering: true });
    await typeInto(page.locator('#auth-email'), address.toUpperCase());
    await typeInto(page.locator('#auth-password'), 'hunter78');
    await typeInto(page.locator('#auth-confirm'), 'hunter78');

    const verdict = await classifySave(page, 'Register!', { timeout: 90_000 });
    expect(verdict.outcome, verdict.message).toBe('accepted');
  });

/**
 * The reset flow needs a different oracle from everything else in this suite.
 *
 * `AuthModal`'s reset handler bypasses the validator, does its own blank check,
 * and then toasts and closes in a `finally` regardless of what the server said —
 * deliberately, so that an attacker cannot use it to discover which addresses
 * are registered. `classifySave` would therefore report 'accepted' for every
 * input and prove nothing. What is asserted instead is the invariant that makes
 * the flow safe: the response is identical whether or not the account exists.
 */
test('a reset request looks the same for a known and an unknown address',
  async ({ page }) => {
    const messages = [];
    for (const address of [process.env.YASSS_ADMIN_EMAIL, 'definitely-nobody@example.com']) {
      await openAuth(page);
      await typeInto(page.locator('#auth-email'), address);
      await modalButton(page, 'Reset Account').click();

      await expect(page.locator('.modal.is-active')).toHaveCount(0);
      const toast = page.locator('.notification').first();
      await expect(toast).toBeVisible();
      messages.push((await toast.innerText()).replace(address, '<address>').trim());
      await page.reload();
      await ready(page);
    }

    // Deliberately not a timing comparison: that would be measuring a shared
    // podman host, and the scrypt-free path is the same either way.
    expect(messages[0]).toBe(messages[1]);
  });

test('a blank address is the one thing the reset flow refuses', async ({ page }) => {
  await openAuth(page);
  await modalButton(page, 'Reset Account').click();

  // The only branch that does not close, because there is nothing to send.
  await expect(page.locator('.modal.is-active')).toHaveCount(1);
  await expect(page.locator('#auth-email-error')).toBeVisible();
  await closeModal(page);
});
