import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles the HUD single-file component for the tests that mount it.
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/architecture/fixtures/**', 'tests/e2e/**'],
  },
});
