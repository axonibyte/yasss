/**
 * Authentication against the real server.
 *
 * The only place real Ed25519 verification runs in a browser. The fake API
 * verifies no signatures at all — deliberately, since `creds.test.js` owns that
 * against golden vectors — so nothing else proves that a payload the browser
 * derives is one the Java verifier accepts, or that a token the server minted
 * is one it will take back.
 *
 * The account is registered by `e2e/run.sh` before the fuzz stage; see
 * `frontend/tools/register-admin.mjs` for why the ordering matters.
 */
import { test, expect } from '@playwright/test';
import { genCreds } from '../../src/lib/crypto/creds.js';

const EMAIL = process.env.YASSS_ADMIN_EMAIL ?? 'e2e-admin@example.com';
const PASSWORD = process.env.YASSS_ADMIN_PASSWORD ?? 'e2e-admin-password';
const ACCOUNT = process.env.YASSS_ADMIN_ID;

async function ready(page) {
  await page.waitForSelector('.pageloader:not(.is-active)', { timeout: 30_000 });
}

const decode = (b64) => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));

test('real credentials authenticate and return the three headers', async ({ page }) => {
  const { payload } = await genCreds(EMAIL, PASSWORD);

  const res = await page.request.get('/v1', {
    headers: { Authorization: `AXB-SIG-REQ ${payload}` },
  });
  expect(res.status()).toBe(200);

  const headers = res.headers();
  expect(headers['axb-account']).toBe(ACCOUNT);
  expect(headers['axb-access-level']).toBe('ADMIN');
  expect(headers['axb-session']).toBeTruthy();

  // The token's shape is a contract the fake server is written against, so
  // pinning it here is what keeps the fake honest.
  const outer = decode(headers['axb-session']);
  expect(typeof outer.creds).toBe('string');
  expect(typeof outer.sig).toBe('string');

  // `kid` names the signer that produced `sig`. It rides in the envelope rather
  // than in `creds` because `creds` is what gets signed, so the signer would
  // have to be chosen before the object naming it exists. Its absence would not
  // fail loudly — verification would simply stop finding a key and every caller
  // would quietly become anonymous — so it is worth asserting.
  expect(outer.kid).toMatch(/^[0-9a-f-]{36}$/i);

  const creds = decode(outer.creds);
  expect(creds.account).toBe(ACCOUNT);

  // `sat` is the session start, carried forward unchanged; `iat` is restamped
  // on every response. Both are what `SessionTicket.evaluate` reads to decide
  // the idle timeout, the absolute lifetime and revocation, and a ticket
  // missing either is treated as legacy and refused outright.
  expect(typeof creds.sat).toBe('number');
  expect(typeof creds.iat).toBe('number');
  expect(creds.iat).toBeGreaterThan(Date.now() - 60_000);
  expect(creds.sat).toBeLessThanOrEqual(creds.iat + 1);
});

test('a wrong password is refused without erroring', async ({ page }) => {
  const { payload } = await genCreds(EMAIL, 'not-the-password');

  const res = await page.request.get('/v1', {
    headers: { Authorization: `AXB-SIG-REQ ${payload}` },
  });

  // A bad signature degrades to anonymous rather than failing the request —
  // AuthToken catches, logs, and leaves the actor null.
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe('ok');
  expect(res.headers()['axb-account']).toBeUndefined();
});

test('the session token the server minted is accepted back', async ({ page }) => {
  const { payload } = await genCreds(EMAIL, PASSWORD);
  const first = await page.request.get('/v1', {
    headers: { Authorization: `AXB-SIG-REQ ${payload}` },
  });
  const session = first.headers()['axb-session'];

  const second = await page.request.get('/v1', {
    headers: { Authorization: `AXB-SIG-REQ ${session}` },
  });

  // The fake never verifies anything, so this is the only proof the real
  // ticket engine accepts a token it signed itself.
  expect(second.headers()['axb-account']).toBe(ACCOUNT);
});

test('logging in through the browser derives a working key', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  // Real scrypt in Chromium, real Ed25519 verification server-side.
  await page.getByRole('link', { name: 'Log In' }).click();
  await page.getByLabel('Email Address').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log In!' }).click();

  await expect(page.getByText('Logged in!')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Log Out' })).toBeVisible();

  const cookie = (await page.context().cookies()).find((c) => c.name === 'user');
  expect(JSON.parse(decodeURIComponent(cookie.value)).account).toBe(ACCOUNT);
});

test('an authenticated user can publish an event and owns it', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByRole('link', { name: 'Log In' }).click();
  await page.getByLabel('Email Address').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log In!' }).click();
  await expect(page.getByText('Logged in!')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: 'Create Event' }).click();
  await page.getByLabel('Event Title').fill('Owned Live Event');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Add an Activity' }).click();
  await page.getByLabel('Activity', { exact: true }).fill('Setup');
  await page.getByRole('button', { name: 'Save Activity' }).click();
  await page.getByRole('button', { name: 'Add a Window' }).click();
  await page.getByRole('button', { name: 'Save Window' }).click();
  await page.getByRole('button', { name: 'Publish Event' }).click();

  // Signed in, so no guest interstitial.
  await expect(page.getByText('Successfully created your event!')).toBeVisible();
  await page.waitForURL(/\?event=/);

  await page.reload();
  await ready(page);

  // Proves three things at once against a real database: CreateEvent's
  // at-least-STANDARD branch (unreachable for an UNVERIFIED account), that
  // `admin` was persisted, and that the widened ListEvents scoping returns it.
  await expect(page.getByRole('button', { name: 'Modify Event' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Report' })).toBeVisible();
});
