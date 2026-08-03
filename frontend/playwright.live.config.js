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
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
