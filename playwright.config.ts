import { defineConfig, devices } from '@playwright/test';

const PORT = 3111;
const ORIGIN = `http://127.0.0.1:${String(PORT)}`;

/**
 * End-to-end suite: a real browser against the real Nuxt dev server running the playground.
 * Needs the browsers installed once: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx nuxt dev playground --port ${String(PORT)} --host 127.0.0.1`,
    url: `${ORIGIN}/ok`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    env: { NUXT_TELEMETRY_DISABLED: '1' },
  },
});
