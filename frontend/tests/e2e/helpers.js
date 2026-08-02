/** Shared harness helpers for talking to the fake API's control endpoints. */

/**
 * NOTE: there is deliberately no global reset helper.
 *
 * The suite runs in parallel against a single fake server, so wiping shared
 * state in a beforeEach tears the ground out from under the other workers.
 * Seeded ids are unique per call, so each test is already isolated by the data
 * it creates.
 */

/**
 * @returns {Promise<{user: object|null, eventId: string|null}>}
 */
export async function seed(request, spec) {
  const res = await request.post('/__test__/seed', { data: spec });
  return res.json();
}

/** Arm the fake so the next signed payload authenticates as this address. */
export async function expectLogin(request, email) {
  await request.post('/__test__/expect-login', { data: { email } });
}

/** Wait past the boot splash, which is held for a deliberate minimum. */
export async function waitForApp(page) {
  await page.waitForSelector('.pageloader:not(.is-active)', { timeout: 15_000 });
}

export async function logIn(page, request, { email = 'ada@example.com', password = 'hunter2' } = {}) {
  await expectLogin(request, email);
  await page.getByRole('link', { name: 'Log In' }).click();
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In!' }).click();
}
