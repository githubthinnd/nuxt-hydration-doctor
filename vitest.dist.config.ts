import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

/**
 * Runs the smoke tests against the BUILT package (`dist/`), which every other test bypasses by
 * importing `src/`. Needs `npm run build` first, so it is not part of `npm test`.
 */
export default defineConfig({
  // Compiles the single-file component exactly as it ships.
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/dist/**/*.test.ts'],
  },
});
