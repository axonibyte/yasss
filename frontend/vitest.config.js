import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Without this Svelte resolves to its server build and mount() is unavailable,
  // so component rendering fails under jsdom.
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    // scrypt at N=16384 is deliberately expensive, and v8 coverage
    // instrumentation makes it slower still -- the default 5s is not enough to
    // run the credential vectors under --coverage.
    testTimeout: 60_000,
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/unit/**/*.{test,spec}.js', 'tests/component/**/*.{test,spec}.js'],
    // Playwright owns tests/e2e; keep it out of the unit run.
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
