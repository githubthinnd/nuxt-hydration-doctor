// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSET_CSS, ASSET_HTML, ASSET_JS, DEVTOOLS_BASE } from '../../../src/devtools/page';
import { DEVTOOLS_ISSUES_PATH } from '../../../src/runtime/domain/constants';
import { makeIssue } from '../../support/issue';
import { makeDiagnosis, makeReport } from '../../support/report';
import { required } from '../../support/required';

interface WireReport {
  seq: number;
  receivedAt: number;
  pageLoadId: string;
  editorFile: string | null;
  issue: ReturnType<typeof makeIssue>;
  diagnostics: ReturnType<typeof makeDiagnosis>[];
}

function wire(overrides: Partial<WireReport> = {}): WireReport {
  const base = makeReport();
  return {
    seq: 1,
    receivedAt: 1_700_000_000_000,
    editorFile: '/project/components/Widget.vue',
    ...base,
    diagnostics: [...base.diagnostics],
    ...overrides,
  };
}

interface Api {
  reports: WireReport[];
  latest: number;
  generation: number;
}

/** Loads the page's own HTML and script against a scripted dev API. */
async function openPage(api: () => Api | 'down') {
  const body = /<body>([\s\S]*)<\/body>/.exec(ASSET_HTML)?.[1] ?? '';
  document.body.innerHTML = body.replace(/<script[^>]*><\/script>/, '');
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchStub = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, ...(init === undefined ? {} : { init }) });
    if (init?.method === 'DELETE')
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    if (url.startsWith('/__open-in-editor')) return Promise.resolve({ ok: true });
    const state = api();
    if (state === 'down') return Promise.reject(new Error('offline'));
    const since = Number(new URL(url, 'http://x').searchParams.get('since'));
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          ...state,
          reports: state.reports.filter((report) => report.seq > since),
        }),
    });
  });
  vi.stubGlobal('fetch', fetchStub);
  (0, eval)(ASSET_JS);
  await vi.advanceTimersByTimeAsync(0);
  const q = (selector: string): Element | null => document.querySelector(selector);
  const qa = (selector: string): Element[] => Array.from(document.querySelectorAll(selector));
  return { calls, q, qa, fetchStub, settle: () => vi.advanceTimersByTimeAsync(0) };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('DevTools page assets', () => {
  it('agrees with the mount point and the endpoint the browser reports to', () => {
    expect(DEVTOOLS_BASE).toBe('/__nhd');
    expect(DEVTOOLS_ISSUES_PATH).toBe(`${DEVTOOLS_BASE}/issues`);
    expect(ASSET_HTML).toContain(`href="${DEVTOOLS_BASE}/style.css"`);
    expect(ASSET_HTML).toContain(`src="${DEVTOOLS_BASE}/app.js"`);
    expect(ASSET_JS).toContain(`var BASE = '${DEVTOOLS_BASE}'`);
  });

  it('has no inline script or style, so the strict CSP can apply', () => {
    expect(ASSET_HTML).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(ASSET_HTML).not.toMatch(/<style/);
    expect(ASSET_HTML).not.toMatch(/\son\w+=/);
    expect(ASSET_CSS.length).toBeGreaterThan(200);
  });

  it('never builds markup from data: no innerHTML, outerHTML, document.write or eval', () => {
    expect(ASSET_JS).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/,
    );
  });
});

describe('DevTools page behaviour', () => {
  it('shows an empty state until something is reported', async () => {
    const page = await openPage(() => ({ reports: [], latest: 0, generation: 0 }));
    expect(page.q('.empty')?.textContent).toContain('No hydration mismatches reported yet');
    expect(page.q('#status')?.textContent).toBe('0 reports');
  });

  it('lists a report with source, route, metrics, breadcrumbs, diagnosis and markup', async () => {
    const report = wire();
    const page = await openPage(() => ({ reports: [report], latest: 1, generation: 0 }));

    const text = required(page.q('main'), 'main').textContent;
    expect(text).toContain('Text mismatch');
    expect(text).toContain('Widget');
    expect(text).toContain('components/Widget.vue:3:5');
    expect(text).toContain('812 ms after navigation start');
    expect(text).toContain('Page load load-1 · 1 issue');
    expect(page.qa('.crumbs li').map((li) => li.textContent)).toEqual([
      'route /',
      'during initial hydration',
    ]);
    expect(text).toContain('The current time or date is rendered on both sides');
    expect(text).toContain('High confidence · 92%');
    expect(text).toContain('Two timestamps 3000 ms apart.');
    expect(page.q('.diag pre')?.textContent).toBe("const now = useState('now', () => Date.now())");
    const markup = page.qa('details pre').map((pre) => pre.textContent);
    expect(markup).toEqual(['<p>server</p>', '<p>client</p>']);
    expect(page.q('#status')?.textContent).toBe('1 report');
  });

  it('opens the file in the editor through Nuxt’s own endpoint, at line and column', async () => {
    const page = await openPage(() => ({ reports: [wire()], latest: 1, generation: 0 }));
    const open = required(
      page.qa('button').find((b) => b.textContent === 'Open in editor'),
      'Open in editor button',
    ) as HTMLElement;
    open.click();
    await page.settle();

    const call = required(page.calls.find((c) => c.url.startsWith('/__open-in-editor')));
    expect(call.url).toBe(
      `/__open-in-editor?file=${encodeURIComponent('/project/components/Widget.vue:3:5')}`,
    );
    expect(page.q('#toast')?.textContent).toBe('Opened in your editor');
  });

  it('offers no editor button when the file is outside the project or unknown', async () => {
    const page = await openPage(() => ({
      reports: [wire({ editorFile: null })],
      latest: 1,
      generation: 0,
    }));
    expect(page.qa('button').some((b) => b.textContent === 'Open in editor')).toBe(false);
    expect(page.qa('button').some((b) => b.textContent === 'Copy')).toBe(true);
  });

  it('says so when the element has no source location', async () => {
    const page = await openPage(() => ({
      reports: [wire({ issue: makeIssue({ location: null, occurrence: null }), editorFile: null })],
      latest: 1,
      generation: 0,
    }));
    expect(page.q('main')?.textContent).toContain('Unknown (no source location');
  });

  it('shows hostile text as text and never creates elements from it', async () => {
    const hostile =
      '<img src=x onerror="window.__nhd_pwned = true"><script>window.__nhd_pwned = true</script>';
    const report = wire({
      issue: makeIssue({
        message: hostile,
        serverHtml: hostile,
        clientHtml: hostile,
        componentName: hostile,
      }),
      diagnostics: [makeDiagnosis({ title: hostile, explanation: hostile, evidence: [hostile] })],
    });
    const page = await openPage(() => ({ reports: [report], latest: 1, generation: 0 }));

    expect(page.qa('img, script, iframe')).toHaveLength(0);
    expect(page.q('main')?.textContent).toContain('onerror');
    expect((window as unknown as Record<string, unknown>)['__nhd_pwned']).toBeUndefined();
  });

  it('puts the newest page load first and the newest issue first within it', async () => {
    const a = wire({
      seq: 1,
      pageLoadId: 'old',
      issue: makeIssue({ id: 'nhd-1', componentName: 'First' }),
    });
    const b = wire({
      seq: 2,
      pageLoadId: 'new',
      issue: makeIssue({ id: 'nhd-1', componentName: 'Second' }),
    });
    const c = wire({
      seq: 3,
      pageLoadId: 'new',
      issue: makeIssue({ id: 'nhd-2', componentName: 'Third' }),
    });
    const page = await openPage(() => ({ reports: [a, b, c], latest: 3, generation: 0 }));

    expect(page.qa('.group-title').map((t) => t.textContent)).toEqual([
      'Page load new · 2 issues',
      'Page load old · 1 issue',
    ]);
    expect(page.qa('.card h2').map((h) => h.textContent)).toEqual([
      'Text mismatch · Third',
      'Text mismatch · Second',
      'Text mismatch · First',
    ]);
  });

  it('picks up new reports on the next poll without refetching old ones', async () => {
    const state: Api = { reports: [wire({ seq: 1 })], latest: 1, generation: 0 };
    const page = await openPage(() => state);
    expect(page.qa('.card')).toHaveLength(1);

    state.reports.push(wire({ seq: 2, issue: makeIssue({ id: 'nhd-2' }) }));
    state.latest = 2;
    await vi.advanceTimersByTimeAsync(1600);

    expect(page.qa('.card')).toHaveLength(2);
    const urls = page.calls.map((c) => c.url);
    expect(urls).toContain('/__nhd/issues?since=1');
  });

  it('clears the history through the server', async () => {
    const state: Api = { reports: [wire()], latest: 1, generation: 0 };
    const page = await openPage(() => state);
    expect(page.qa('.card')).toHaveLength(1);

    state.reports = [];
    state.generation = 1;
    (page.q('#clear') as HTMLElement).click();
    await page.settle();
    await page.settle();

    const del = required(page.calls.find((c) => c.init?.method === 'DELETE'));
    expect(del.url).toBe('/__nhd/issues');
    expect(del.init?.headers).toEqual({ 'x-nhd-client': '1' });
    expect(page.qa('.card')).toHaveLength(0);
  });

  it('starts over when the history was cleared elsewhere (generation changed)', async () => {
    const state: Api = { reports: [wire({ seq: 1 })], latest: 1, generation: 0 };
    const page = await openPage(() => state);
    expect(page.qa('.card')).toHaveLength(1);

    state.reports = [wire({ seq: 2, pageLoadId: 'fresh' })];
    state.latest = 2;
    state.generation = 1;
    await vi.advanceTimersByTimeAsync(1600);

    expect(page.qa('.group-title').map((t) => t.textContent)).toEqual([
      'Page load fresh · 1 issue',
    ]);
  });

  it('reports when the dev server cannot be reached, and recovers', async () => {
    let down = true;
    const page = await openPage(() =>
      down ? 'down' : { reports: [wire()], latest: 1, generation: 0 },
    );
    expect(page.q('#status')?.textContent).toBe('Cannot reach the dev server');
    expect(page.q('#status')?.className).toBe('error');

    down = false;
    await vi.advanceTimersByTimeAsync(1600);
    expect(page.q('#status')?.textContent).toBe('1 report');
    expect(page.q('#status')?.className).toBe('');
  });

  it('sends the client marker header on every request it makes to the API', async () => {
    const page = await openPage(() => ({ reports: [], latest: 0, generation: 0 }));
    const apiCalls = page.calls.filter((c) => c.url.startsWith('/__nhd'));
    expect(apiCalls.length).toBeGreaterThan(0);
    for (const call of apiCalls) {
      expect(call.init?.headers).toEqual({ 'x-nhd-client': '1' });
    }
  });
});
