// @vitest-environment happy-dom
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HydrationDoctorHUD from '../../src/runtime/components/HydrationDoctorHUD.vue';
import type { HydrationIssue } from '../../src/runtime/domain/issue';
import { diffHtml } from '../../src/runtime/engine/html-diff';
import { HUD_HOST_ID, mountHud, type HudHandle } from '../../src/runtime/hud/mount-hud';
import { required } from '../support/required';
import { createIssueStore, type IssueStore } from '../../src/runtime/interceptor/issue-store';

const ATTR = 'data-nhd-loc';

function issue(overrides: Partial<HydrationIssue> = {}): HydrationIssue {
  return {
    id: 'nhd-1',
    kind: 'text-mismatch',
    message: 'Hydration text content mismatch on<p>server</p>',
    route: '/products',
    componentName: 'ProductCard',
    location: { file: 'components/ProductCard.vue', line: 3, column: 5 },
    occurrence: 0,
    ancestry: [],
    componentSource: null,
    serverHtml: '<p data-nhd-loc="components/ProductCard.vue:3:5">server text</p>',
    clientHtml: '<p data-nhd-loc="components/ProductCard.vue:3:5">client text</p>',
    breadcrumbs: ['route /products', 'during initial hydration', 'ProductCard'],
    metrics: { detectedAt: 0, msSinceNavigationStart: 1234.4 },
    ...overrides,
  };
}

interface Harness {
  readonly api: IssueStore;
  readonly handle: HudHandle;
  readonly copy: ReturnType<typeof vi.fn>;
  readonly root: ShadowRoot;
  $(selector: string): Element | null;
  $$(selector: string): Element[];
  click(selector: string, index?: number): Promise<void>;
}

function mount(options: { autoOpen?: boolean; issues?: readonly HydrationIssue[] } = {}): Harness {
  const api = createIssueStore(50, () => undefined);
  for (const initial of options.issues ?? []) api.add(initial);
  const copy = vi.fn();
  const handle = mountHud({
    document,
    view: window,
    component: HydrationDoctorHUD,
    api,
    attribute: ATTR,
    autoOpen: options.autoOpen ?? true,
    toEntry: (i) => ({
      issue: i,
      diff:
        i.serverHtml !== null && i.clientHtml !== null
          ? diffHtml(i.serverHtml, i.clientHtml, { hideAttributes: [ATTR] })
          : null,
      diagnostics: [],
    }),
    copyText: copy,
    reportInternal: (message, error) => {
      throw new Error(`internal failure: ${message}: ${String(error)}`);
    },
  });
  const root = required(handle.host.shadowRoot, 'shadow root');
  const harness: Harness = {
    api,
    handle,
    copy,
    root,
    $: (selector) => root.querySelector(selector),
    $$: (selector) => Array.from(root.querySelectorAll(selector)),
    async click(selector, index = 0) {
      (harness.$$(selector)[index] as HTMLElement).click();
      await nextTick();
    },
  };
  return harness;
}

let current: Harness | null = null;
function mounted(options?: Parameters<typeof mount>[0]): Harness {
  current = mount(options);
  return current;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});
afterEach(() => {
  current?.handle.unmount();
  current = null;
});

describe('HUD in a shadow root', () => {
  it('lives in a closed-off shadow root and leaks no CSS into the page', async () => {
    const hud = mounted({ issues: [issue()] });
    await nextTick();

    expect(hud.handle.host.id).toBe(HUD_HOST_ID);
    expect(hud.handle.host.parentElement).toBe(document.body);
    expect(hud.root.querySelector('style')?.textContent).toContain('.nhd-panel');
    // Nothing of the HUD's styling or markup is in the page's own light DOM or head.
    expect(document.head.innerHTML).not.toContain('nhd-');
    expect(document.body.querySelector('.nhd-panel')).toBeNull();
    expect(document.querySelector('style')).toBeNull();
  });

  it('shows a badge with the issue count and opens the panel on the first issue', async () => {
    const hud = mounted({ issues: [issue()] });
    await nextTick();

    expect(hud.$('.nhd-badge')?.textContent).toContain('1');
    expect(hud.$('.nhd-badge')?.getAttribute('aria-expanded')).toBe('true');
    expect(hud.$('.nhd-panel')).not.toBeNull();
  });

  it('stays closed until asked when autoOpen is off', async () => {
    const hud = mounted({ autoOpen: false, issues: [issue()] });
    await nextTick();
    expect(hud.$('.nhd-panel')).toBeNull();

    await hud.click('.nhd-badge');
    expect(hud.$('.nhd-panel')).not.toBeNull();
  });

  it('renders the side-by-side diff with both column headings and highlighted divergences', async () => {
    const hud = mounted({ issues: [issue()] });
    await nextTick();

    const headings = hud.$$('.nhd-diff-head').map((h) => h.textContent);
    expect(headings).toEqual(['Server Rendered HTML', 'Client Rendered DOM']);

    const marks = hud.$$('.nhd-diff mark').map((m) => m.textContent);
    expect(marks).toEqual(['server', 'client']);
    expect(hud.$$('.nhd-cell--server.nhd-cell--changed')).toHaveLength(1);
    expect(hud.$$('.nhd-cell--client.nhd-cell--changed')).toHaveLength(1);
    // Matching rows (the <p> and </p> tags) are not highlighted.
    expect(hud.$$('.nhd-cell--server').length).toBe(3);
    expect(hud.$$('.nhd-cell--server:not(.nhd-cell--changed)')).toHaveLength(2);
  });

  it('shows source, component, route, timing, message and breadcrumbs', async () => {
    const hud = mounted({ issues: [issue()] });
    await nextTick();
    const panel = hud.$('.nhd-panel')?.textContent ?? '';

    expect(panel).toContain('components/ProductCard.vue:3:5');
    expect(panel).toContain('ProductCard');
    expect(panel).toContain('/products');
    expect(panel).toContain('1234 ms after navigation start');
    expect(panel).toContain('Hydration text content mismatch');
    expect(hud.$$('.nhd-crumbs li').map((li) => li.textContent)).toEqual([
      'route /products',
      'during initial hydration',
      'ProductCard',
    ]);
  });

  it('copies the source location', async () => {
    const hud = mounted({ issues: [issue()] });
    await nextTick();
    await hud.click('.nhd-loc .nhd-action');
    expect(hud.copy).toHaveBeenCalledWith('components/ProductCard.vue:3:5');
  });

  it('switches between issues from the tabs', async () => {
    const second = issue({
      id: 'nhd-2',
      kind: 'node-mismatch',
      componentName: 'SiteHeader',
      location: { file: 'components/SiteHeader.vue', line: 1, column: 1 },
    });
    const hud = mounted({ issues: [issue(), second] });
    await nextTick();
    expect(hud.$$('.nhd-issue-tab')).toHaveLength(2);
    expect(hud.$('.nhd-meta')?.textContent).toContain('ProductCard');

    await hud.click('.nhd-issue-tab', 1);

    expect(hud.$('.nhd-meta')?.textContent).toContain('SiteHeader');
    expect(hud.$$('.nhd-issue-tab')[1]?.getAttribute('aria-current')).toBe('true');
  });

  it('picks up issues captured after it was mounted', async () => {
    const hud = mounted({ autoOpen: false });
    await nextTick();
    expect(hud.$('.nhd-count')?.textContent).toBe('0');

    hud.api.add(issue());
    await nextTick();

    expect(hud.$('.nhd-count')?.textContent).toBe('1');
    expect(hud.$('.nhd-badge')?.classList.contains('nhd-badge--alert')).toBe(true);
    // autoOpen is off: the badge alerts but the panel waits for the user.
    expect(hud.$('.nhd-panel')).toBeNull();
  });

  it('opens by itself on the first issue captured after mounting when autoOpen is on', async () => {
    const hud = mounted({ autoOpen: true });
    await nextTick();
    expect(hud.$('.nhd-panel')).toBeNull();

    hud.api.add(issue());
    await nextTick();
    expect(hud.$('.nhd-panel')).not.toBeNull();

    // Later issues do not re-open a panel the user closed.
    await hud.click('.nhd-header .nhd-action:last-child');
    hud.api.add(issue({ id: 'nhd-2' }));
    await nextTick();
    expect(hud.$('.nhd-panel')).toBeNull();
    expect(hud.$('.nhd-count')?.textContent).toBe('2');
  });

  it('closes with the Close button and with Escape', async () => {
    const hud = mounted({ issues: [issue()] });
    await nextTick();

    await hud.click('.nhd-header .nhd-action:last-child');
    expect(hud.$('.nhd-panel')).toBeNull();

    await hud.click('.nhd-badge');
    expect(hud.$('.nhd-panel')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(hud.$('.nhd-panel')).toBeNull();
  });

  it('clears the history', async () => {
    const hud = mounted({ issues: [issue()] });
    await nextTick();

    await hud.click('.nhd-header .nhd-action');

    expect(hud.api.issues()).toEqual([]);
    expect(hud.$('.nhd-count')?.textContent).toBe('0');
    expect(hud.$('.nhd-empty')?.textContent).toContain('No hydration mismatches');
  });

  it('explains when a diff is impossible and still shows the markup it has', async () => {
    const hud = mounted({
      issues: [issue({ location: null, occurrence: null, serverHtml: null })],
    });
    await nextTick();

    expect(hud.$$('.nhd-diff')).toHaveLength(0);
    expect(
      hud.$$('.nhd-note').some((note) => note.textContent.includes('needs both renderings')),
    ).toBe(true);
    expect(hud.$$('.nhd-single')).toHaveLength(1);
    expect(hud.$('.nhd-meta')?.textContent).toContain('Unknown (no source location');
  });

  it('says so when both renderings are identical after Vue repaired the DOM', async () => {
    const hud = mounted({
      issues: [issue({ serverHtml: '<p>same</p>', clientHtml: '<p>same</p>' })],
    });
    await nextTick();
    expect(hud.$$('.nhd-note').some((note) => note.textContent.includes('identical'))).toBe(true);
  });

  it('displays hostile markup as text and never executes or inserts it', async () => {
    const hostile =
      '<img src=x onerror="window.__nhd_pwned = true"><script>window.__nhd_pwned = true</script>';
    const hud = mounted({
      issues: [issue({ serverHtml: hostile, clientHtml: '<p>ok</p>', message: hostile })],
    });
    await nextTick();

    expect(hud.$$('img, script, iframe')).toHaveLength(0);
    expect(hud.$('.nhd-panel')?.textContent).toContain('onerror');
    expect((window as unknown as Record<string, unknown>)['__nhd_pwned']).toBeUndefined();
  });
});

describe('HUD overlay', () => {
  function target(rect: { top: number; left: number; width: number; height: number }): void {
    document.body.innerHTML = '<p data-nhd-loc="components/ProductCard.vue:3:5">x</p>';
    const element = required(document.querySelector('p'), 'target element');
    element.getBoundingClientRect = () => ({
      ...rect,
      x: rect.left,
      y: rect.top,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    });
  }

  it('outlines the offending element at its viewport position and labels it', async () => {
    target({ top: 120, left: 40, width: 300, height: 24 });
    const hud = mounted({ issues: [issue()] });
    await nextTick();

    const box = hud.$('.nhd-box') as HTMLElement;
    expect(box.getAttribute('style')).toContain('top: 120px');
    expect(box.getAttribute('style')).toContain('left: 40px');
    expect(box.getAttribute('style')).toContain('width: 300px');
    expect(box.classList.contains('nhd-box--selected')).toBe(true);
    expect(hud.$('.nhd-chip')?.textContent.trim()).toBe(
      'ProductCard components/ProductCard.vue:3:5',
    );
  });

  it('selects the issue when its label is clicked', async () => {
    target({ top: 120, left: 40, width: 300, height: 24 });
    const hud = mounted({ autoOpen: false, issues: [issue()] });
    await nextTick();
    expect(hud.$('.nhd-panel')).toBeNull();

    await hud.click('.nhd-chip');

    expect(hud.$('.nhd-panel')).not.toBeNull();
  });

  it('draws no box when the element is not on the page', async () => {
    document.body.innerHTML = '';
    const hud = mounted({ issues: [issue()] });
    await nextTick();
    expect(hud.$$('.nhd-box')).toHaveLength(0);
  });

  it('puts the label inside the box when it would be cut off at the top of the viewport', async () => {
    target({ top: 4, left: 0, width: 100, height: 20 });
    const hud = mounted({ issues: [issue()] });
    await nextTick();
    expect(hud.$('.nhd-chip')?.classList.contains('nhd-chip--inside')).toBe(true);
  });
});

describe('HUD lifecycle', () => {
  it('removes its host and stops listening when unmounted', async () => {
    const hud = mounted({ issues: [issue()] });
    await nextTick();
    hud.handle.unmount();
    current = null;

    expect(document.getElementById(HUD_HOST_ID)).toBeNull();
    // After unmount the subscription is gone: a new issue must not throw or render anywhere.
    expect(() => {
      hud.api.add(issue({ id: 'nhd-9' }));
    }).not.toThrow();
  });
});
