import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.{test,spec}.js'],
    // Playwright owns tests/e2e; keep it out of the unit run.
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
