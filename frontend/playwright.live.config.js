import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the real stack, driven by e2e/run.sh.
 *
 * Separate from playwright.config.js because the constraints are different.
 * There is no seeding backdoor here — the fake's /__test__ endpoints do not
 * exist on the real server — so these specs build their own state through the
 * UI. That is slower and it is the point: it exercises the actual Java
 * endpoints, the actual schema, and the actual bundle served from the jar.
 *
 * No webServer block either; run.sh owns the stack's lifecycle.
 */
export default defineConfig({
  testDir: './tests/live',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,

  use: {
    baseURL: process.env.YASSS_LIVE_URL ?? 'http://127.0.0.1:7455',
    trace: 'retain-on-failure',
    // Same reasoning as the fake config, with more headroom: the test timeout
    // here is 60s because a real login runs scrypt at N=16384 in the browser.
    // `classifySave` already passes its own 15s where it needs it.
    actionTimeout: 15_000,
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  // `workers` is global rather than per-project, so it must stay at 1 even
  // with several projects defined: these specs share one MariaDB and one
  // bootstrap administrator and build their state through the UI.
  //
  // Only tests tagged `@compat` run on anything but Chromium, and none of the
  // tagged ones log in — scrypt at N=16384 in the browser already needs most of
  // the 60s timeout on its own. Selected by `YASSS_E2E_BROWSERS` in e2e/run.sh.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@compat/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@compat/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, grep: /@compat/ },
  ],
});
