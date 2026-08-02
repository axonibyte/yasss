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
    // The grid's date labels come from toLocaleDateString, so pin both or the
    // expected strings shift with the machine.
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
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
