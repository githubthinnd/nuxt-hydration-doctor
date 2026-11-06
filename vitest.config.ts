import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { astInjector } from './src/plugins/ast-injector';
import { playgroundAutoImports } from './tests/support/playground-plugins';

const playgroundRoot = fileURLToPath(new URL('./playground', import.meta.url));

export default defineConfig({
  plugins: [
    // Lets the tests import the playground's pages as Nuxt would build them for the browser:
    // `ref` auto-imported and every template tag stamped with its source location. The HUD's own
    // components (under src/) are not stamped, as in a real install.
    playgroundAutoImports(),
    astInjector.vite({
      attribute: 'data-nhd-loc',
      exclude: ['/node_modules/', '/src/'],
      root: playgroundRoot,
    }),
    // Compiles the HUD and the playground's single-file components for the tests that mount them.
    vue(),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/architecture/fixtures/**', 'tests/e2e/**', 'tests/dist/**'],
  },
});
