import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    // Gradle's processResources depends on this output; the directory is a
    // build artifact and is gitignored.
    outDir: '../src/main/resources/public',
    emptyOutDir: true,
  },
  css: {
    preprocessorOptions: {
      scss: {
        // bulma-block-list ships only SCSS, which @uses Bulma's sass utilities.
        // Bulma 1.0.4 still uses the deprecated global if(); the warnings are
        // upstream and not actionable here.
        silenceDeprecations: ['global-builtin', 'if-function', 'import', 'color-functions'],
      },
    },
  },
  server: {
    proxy: {
      // `npm run dev` against a locally running YasssCore (api.port default)
      '/v1': 'http://localhost:7455',
    },
  },
});
