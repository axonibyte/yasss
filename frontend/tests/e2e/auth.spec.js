/**
 * Authentication — docs/legacy/01-behavior.md §1.9-§1.12, §4.
 *
 * None of this had any browser coverage before: the fake resolved a login by
 * consuming a single global, which raced across parallel workers, so the login
 * helper existed and was never called. Everything here is newly reachable.
 *
 * Only the first two tests derive real credentials. scrypt at N=16384 costs
 * seconds per call, so the rest arrive signed in via the session cookie.
 */
import { test, expect } from '@playwright/test';
import { logIn, rotateSigner, seed, seedSignedIn, signIn, waitForApp } from './helpers.js';

test('logging in swaps the navbar and stores a session', async ({ page, request }) => {
  const { user } = await seed(request, { user: {} });

  await page.goto('/');
  await waitForApp(page);
  await expect(page.getByRole('link', { name: 'Log In' })).toBeVisible();

  await logIn(page, { email: user.email });

  await expect(page.getByText('Logged in!')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log Out' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log In' })).toHaveCount(0);

  const cookie = (await page.context().cookies()).find((c) => c.name === 'user');
  expect(cookie).toBeTruthy();
  expect(JSON.parse(decodeURIComponent(cookie.value)).account).toBe(user.id);
});

test('a credential for no known account leaves the visitor anonymous', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await logIn(page, { email: 'nobody@example.com' });

  // The server returns no auth headers, so the client must not half-commit:
  // the navbar stays anonymous and no cookie is written.
  await expect(page.getByRole('link', { name: 'Log In' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log Out' })).toHaveCount(0);
  expect((await page.context().cookies()).find((c) => c.name === 'user')).toBeFalsy();
});

test('registration posts the key derived from the password', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await page.getByRole('link', { name: 'Log In' }).click();
  // bulma-switch hides the input behind its label, so the label is the control.
  await page.getByText("Click here if you'd like to register!").click();
  await page.getByLabel('Email Address').fill('newcomer@example.com');
  // Eight characters, not the seven `logIn` defaults to: registration applies
  // the deployment's minimum password length, and login deliberately does not.
  await page.getByLabel('Password', { exact: true }).fill('hunter2!');
  await page.getByLabel('Confirm Password').fill('hunter2!');

  const posted = page.waitForRequest((r) => r.url().endsWith('/v1/users') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Register!' }).click();

  // A 32-byte Ed25519 public key is 44 characters of padded base64. Cheap proof
  // that what genCreds derives is what actually gets registered.
  const body = JSON.parse((await posted).postData());
  expect(body.email).toBe('newcomer@example.com');
  expect(body.pubkey).toHaveLength(44);
  await expect(page.getByText('Your new account was successfully created :)')).toBeVisible();
});

test('a session survives a reload', async ({ page, request }) => {
  await seedSignedIn(page, request);

  await page.goto('/');
  await waitForApp(page);
  await expect(page.getByRole('link', { name: 'Log Out' })).toBeVisible();

  await page.reload();
  await waitForApp(page);
  // boot() validates the stored token rather than trusting or discarding it.
  await expect(page.getByRole('link', { name: 'Log Out' })).toBeVisible();
});

test('a session the server no longer recognises is dropped at boot', async ({ page }) => {
  // A token that decodes to nothing the server knows. Passing a *valid* token
  // with a bogus account id would not test this: the server resolves the
  // caller from the token, not from whatever the cookie claims alongside it.
  await signIn(page, {
    user: { id: 'user-0001', accessLevel: 'STANDARD' },
    session: 'not-a-real-token',
  });

  await page.goto('/');
  await waitForApp(page);

  await expect(page.getByRole('link', { name: 'Log In' })).toBeVisible();
  expect((await page.context().cookies()).find((c) => c.name === 'user')).toBeFalsy();
});

test('a rotated session token is persisted immediately', async ({ page, request }) => {
  const { session, user } = await seedSignedIn(page, request);

  await page.goto('/');
  await waitForApp(page);

  await rotateSigner(request, user.id);
  // Any authenticated call for this account now returns a different token.
  await page.reload();
  await waitForApp(page);

  const cookie = (await page.context().cookies()).find((c) => c.name === 'user');
  // The legacy advanced the in-memory token but only wrote the cookie inside
  // refreshUserSession, so a reload between rotations logged the user out.
  expect(JSON.parse(decodeURIComponent(cookie.value)).session).not.toBe(session);
});

test('logging out clears the cookie, not just the chrome', async ({ page, request }) => {
  await seedSignedIn(page, request);
  await page.goto('/');
  await waitForApp(page);

  await page.getByRole('link', { name: 'Log Out' }).click();

  await expect(page.getByRole('link', { name: 'Log In' })).toBeVisible();
  expect((await page.context().cookies()).find((c) => c.name === 'user')).toBeFalsy();
});

test('a reset request is indistinguishable for an unknown address', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await page.getByRole('link', { name: 'Log In' }).click();
  await page.getByLabel('Email Address').fill('whoever@example.com');
  await page.getByRole('button', { name: 'Reset Account' }).click();

  // Deliberately says the same thing whether or not the account exists.
  await expect(
    page.getByText('If an account with the email address whoever@example.com exists'),
  ).toBeVisible();
});
