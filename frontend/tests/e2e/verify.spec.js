/**
 * Account verification from an emailed link.
 *
 * Previously untested, and the flow was broken in a way no test would have
 * caught from the client side: the link carried a `TicketEngine` signature
 * whose signing keys roll on a roughly fifteen-minute horizon and are lost on
 * restart, so a verification email was dead long before most people opened it.
 * The token is now stored on the user, which is what these assert against.
 *
 * The token never leaves the server in real life, so the specs read it back
 * through `/__test__` — the same shape as `reminders.spec.js`.
 */
import { test, expect } from '@playwright/test';
import { seed, waitForApp } from './helpers.js';

/** The verification token the API itself never discloses. */
async function verifyToken(request, userId) {
  const res = await request.get(`/__test__/user/${userId}/verify-token`);
  return (await res.json()).token;
}

async function userState(request, userId) {
  const res = await request.get(`/v1/users/${userId}`);
  return (await res.json()).user;
}

test('an emailed link verifies the account', async ({ page, request }) => {
  const { user } = await seed(request, { user: { accessLevel: 'UNVERIFIED' } });
  const token = await verifyToken(request, user.id);
  expect(token).toBeTruthy();

  await page.goto(`/?action=verify-user&user=${user.id}&token=${token}`);
  await waitForApp(page);
  await expect(page.getByText('Successfully verified your account!')).toBeVisible();

  expect((await userState(request, user.id)).accessLevel).toBe('STANDARD');
});

test('the link is single-use', async ({ page, request }) => {
  // Verifying clears the token, so replaying the same link must not verify a
  // later pending address.
  const { user } = await seed(request, { user: { accessLevel: 'UNVERIFIED' } });
  const token = await verifyToken(request, user.id);

  await page.goto(`/?action=verify-user&user=${user.id}&token=${token}`);
  await waitForApp(page);
  await expect(page.getByText('Successfully verified your account!')).toBeVisible();

  expect(await verifyToken(request, user.id)).toBeNull();

  await page.goto(`/?action=verify-user&user=${user.id}&token=${token}`);
  await waitForApp(page);
  // The app surfaces the server's own reason in preference to its fallback.
  await expect(page.getByText('access denied')).toBeVisible();
});

test('a wrong token is refused and leaves the account unverified', async ({ page, request }) => {
  const { user } = await seed(request, { user: { accessLevel: 'UNVERIFIED' } });

  await page.goto(
    `/?action=verify-user&user=${user.id}`
      + '&token=00000000-0000-0000-0000-000000000000',
  );
  await waitForApp(page);
  await expect(page.getByText('access denied')).toBeVisible();

  expect((await userState(request, user.id)).accessLevel).toBe('UNVERIFIED');
});

test('a malformed token is refused rather than erroring', async ({ page, request }) => {
  // The value comes straight off a URL, so this is ordinary input.
  const { user } = await seed(request, { user: { accessLevel: 'UNVERIFIED' } });

  await page.goto(`/?action=verify-user&user=${user.id}&token=not-a-uuid`);
  await waitForApp(page);
  await expect(page.getByText('access denied')).toBeVisible();

  expect((await userState(request, user.id)).accessLevel).toBe('UNVERIFIED');
});

test('a verified account cannot request another verification email', async ({ page, request }) => {
  const { user } = await seed(request, { user: { accessLevel: 'UNVERIFIED' } });
  const token = await verifyToken(request, user.id);

  await page.goto(`/?action=verify-user&user=${user.id}&token=${token}`);
  await waitForApp(page);
  await expect(page.getByText('Successfully verified your account!')).toBeVisible();

  // Verifying moves the pending address onto the account, so there is nothing
  // left to confirm and a resend is a conflict rather than a fresh token. This
  // is also why the "already verified" branch of the endpoint is unreachable
  // from outside: you cannot obtain a live token for a verified account.
  const res = await request.put(`/v1/users/${user.id}`, { data: {} });
  expect(res.status()).toBe(409);
});

test('a registered account starts unverified and cannot yet sign in', async ({ request }) => {
  // The premise behind the "unverified banner" idea was that such a user signs
  // in and hits silent 403s. They cannot sign in at all: the server resolves
  // credentials against the verified `email` column, which is still null.
  const res = await request.post('/v1/users', {
    data: { email: `fresh-${Date.now()}@example.com`, pubkey: 'AAAA' },
  });
  expect(res.status()).toBe(201);

  const { user } = await res.json();
  expect(user.accessLevel).toBe('UNVERIFIED');
  expect(user.email).toBeNull();
  expect(await verifyToken(request, user.id)).toBeTruthy();
});
