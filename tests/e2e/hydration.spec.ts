import { expect, test, type Page } from '@playwright/test';

/**
 * Real browser, real Nuxt dev server, the playground's deliberate mismatches.
 * Playwright's CSS locators see through open shadow roots, so the HUD is queried directly.
 */

const count = (page: Page) => page.locator('.nhd-count');
const titles = (page: Page) => page.locator('.nhd-diagnosis-title');

/** Waits until the HUD has captured something (hydration finished and the issue was completed). */
async function waitForIssue(page: Page): Promise<void> {
  await expect(count(page)).not.toHaveText('0');
}

test.describe('control', () => {
  test('a page that hydrates cleanly reports nothing', async ({ page }) => {
    await page.goto('/ok');
    await expect(page.getByTestId('ok')).toBeVisible();
    await expect(page.locator('.nhd-badge')).toBeVisible();
    await expect(count(page)).toHaveText('0');
    await expect(page.locator('.nhd-box')).toHaveCount(0);
  });
});

const scenarios: {
  path: string;
  title: RegExp;
  evidence: RegExp;
  prepare?: (page: Page) => Promise<void>;
}[] = [
  { path: '/time', title: /current time/i, evidence: /new Date\(\)/ },
  { path: '/random', title: /random/i, evidence: /Math\.random\(\)/ },
  {
    path: '/browser-global',
    title: /browser-only value/i,
    evidence: /window\.innerWidth/,
    prepare: (page) => page.setViewportSize({ width: 1280, height: 720 }),
  },
  {
    path: '/storage',
    title: /browser-only value/i,
    evidence: /localStorage\["nhd-demo-theme"\]/,
    prepare: async (page) => {
      await page.addInitScript(() => {
        localStorage.setItem('nhd-demo-theme', 'solarized-dark');
      });
    },
  },
  { path: '/nesting', title: /invalid html nesting/i, evidence: /<div> inside <p>/ },
  { path: '/table', title: /invalid html nesting/i, evidence: /<tbody>/ },
  { path: '/state', title: /shared state/i, evidence: /useState\("demo-counter"\)/ },
];

test.describe('deliberate mismatches', () => {
  for (const scenario of scenarios) {
    test(`${scenario.path} is captured and explained`, async ({ page }) => {
      await scenario.prepare?.(page);
      await page.goto(scenario.path);
      await waitForIssue(page);

      // The panel opens by itself on the first issue and points at the right file.
      await expect(page.locator('.nhd-panel')).toBeVisible();
      await expect(page.locator('.nhd-meta')).toContainText(`pages${scenario.path}.vue`);
      await expect(titles(page).first()).toContainText(scenario.title);
      await expect(page.locator('.nhd-evidence').first()).toContainText(scenario.evidence);

      // Both sides of the diff are shown.
      await expect(page.locator('.nhd-diff-head').first()).toHaveText('Server Rendered HTML');
      await expect(page.locator('.nhd-diff-head').nth(1)).toHaveText('Client Rendered DOM');
      await expect(page.locator('.nhd-code').first()).not.toBeEmpty();
    });
  }
});

test.describe('HUD', () => {
  test('outlines the offending element where it is on screen', async ({ page }) => {
    await page.goto('/time');
    await waitForIssue(page);

    const outline = page.locator('.nhd-box--selected');
    await expect(outline).toBeVisible();
    const target = await page.getByTestId('time').boundingBox();
    const box = await outline.boundingBox();
    expect(target).not.toBeNull();
    expect(box).not.toBeNull();
    expect(Math.abs((box?.x ?? 0) - (target?.x ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((box?.y ?? 0) - (target?.y ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((box?.width ?? 0) - (target?.width ?? 0))).toBeLessThanOrEqual(2);
  });

  test('closes with Escape and reopens from the badge', async ({ page }) => {
    await page.goto('/random');
    await waitForIssue(page);
    await expect(page.locator('.nhd-panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.nhd-panel')).toBeHidden();
    await page.locator('.nhd-badge').click();
    await expect(page.locator('.nhd-panel')).toBeVisible();
  });

  test('keeps its styles out of the page and the page’s styles out of the HUD', async ({
    page,
  }) => {
    await page.goto('/random');
    await waitForIssue(page);
    const leaked = await page.evaluate(() =>
      Array.from(document.querySelectorAll('style')).some((style) =>
        style.textContent.includes('.nhd-'),
      ),
    );
    expect(leaked).toBe(false);
  });
});

test.describe('Nuxt DevTools tab', () => {
  test('lists what the browser reported, with a working Open in editor link', async ({
    page,
    context,
  }) => {
    await page.goto('/time');
    await waitForIssue(page);

    const tab = await context.newPage();
    const opened: string[] = [];
    await tab.route('**/__open-in-editor**', async (route) => {
      opened.push(route.request().url());
      await route.fulfill({ status: 200, body: 'ok' });
    });
    await tab.goto('/__nhd/');

    await expect(tab.locator('.card').first()).toContainText('Text mismatch');
    await expect(tab.locator('.card').first()).toContainText('pages/time.vue');
    await expect(tab.locator('.card .diag h3').first()).toContainText(/current time/i);
    await expect(tab.locator('.card .meta')).toContainText('ms after navigation start');

    await tab.getByRole('button', { name: 'Open in editor' }).first().click();
    await expect(tab.locator('#toast')).toHaveText('Opened in your editor');
    expect(opened).toHaveLength(1);
    const file = new URL(opened[0] ?? '').searchParams.get('file') ?? '';
    expect(file).toMatch(/playground\/pages\/time\.vue:\d+:\d+$/);
  });

  test('clears the history', async ({ page, context }) => {
    await page.goto('/random');
    await waitForIssue(page);
    const tab = await context.newPage();
    await tab.goto('/__nhd/');
    await expect(tab.locator('.card').first()).toBeVisible();

    await tab.getByRole('button', { name: 'Clear history' }).click();
    await expect(tab.locator('.card')).toHaveCount(0);
    await expect(tab.locator('.empty')).toContainText('No hydration mismatches reported yet');
  });

  test('its endpoint serves the page under a strict policy and refuses unmarked writes', async ({
    request,
  }) => {
    const page = await request.get('/__nhd/');
    expect(page.status()).toBe(200);
    expect(page.headers()['content-security-policy']).toContain("default-src 'none'");

    const write = await request.post('/__nhd/issues', { data: { pageLoadId: 'x' } });
    expect(write.status()).toBe(403);
    const invalid = await request.post('/__nhd/issues', {
      data: { pageLoadId: 'x' },
      headers: { 'x-nhd-client': '1' },
    });
    expect(invalid.status()).toBe(400);
  });
});
