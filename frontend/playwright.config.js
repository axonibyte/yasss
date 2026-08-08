import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.FAKE_PORT ?? 4173);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // A locator that can never resolve otherwise eats the whole test timeout,
    // and then eats it again on the retry. That is how one renamed button --
    // `Submit RSVPs` becoming `Submit 1 RSVP`, which is not a substring of it --
    // turned ten failures into ten minutes of what read as a hang. Anything
    // that legitimately needs longer says so at the call site, which is the
    // right place for that claim to be argued.
    actionTimeout: 10_000,
    // The grid's date labels come from toLocaleDateString, so pin both or the
    // expected strings shift with the machine.
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  // Chromium runs everything; the other three run only what is tagged
  // `@compat`. The tagged set is deliberately small — see tests/e2e/compat.spec.js
  // for what earns the tag and why — because the value is in covering the
  // handful of places where engines genuinely differ, not in running the whole
  // suite three more times.
  //
  // Pixel 7 is a Chromium device rather than a mobile Safari profile: Firefox
  // does not support `isMobile`, and what is being covered here is touch
  // dispatch and a 412px viewport rather than WebKit-on-a-phone specifically.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@compat/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@compat/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, grep: /@compat/ },
  ],

  webServer: {
    // Serves the built app and the fake API from one origin, mirroring the
    // real deployment where the Java server hosts both.
    command: 'node tests/fake/main.js',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
