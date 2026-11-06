// @vitest-environment happy-dom
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HydrationDoctorHUD from '../../src/runtime/components/HydrationDoctorHUD.vue';
import type { DiagnosticResult } from '../../src/runtime/domain/diagnostic';
import type { HydrationIssue, SourceLocation } from '../../src/runtime/domain/issue';
import { mountHud, type HudHandle } from '../../src/runtime/hud/mount-hud';
import { createIssueStore } from '../../src/runtime/interceptor/issue-store';
import { makeIssue } from '../support/issue';
import { required } from '../support/required';

function diagnosis(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    category: 'non-deterministic-value',
    confidence: 0.92,
    title: 'The current time or date is rendered on both sides',
    explanation: 'The component reads the clock while rendering.',
    evidence: ['Two timestamps 3000 ms apart.', 'new Date() runs during setup.'],
    fix: {
      language: 'vue',
      description: 'Compute the value once on the server and reuse it on the client.',
      code: "const now = useState('now', () => Date.now())",
    },
    ...overrides,
  };
}

let handle: HudHandle | null = null;

function mount(
  diagnostics: readonly DiagnosticResult[],
  extra: { openInEditor?: (location: SourceLocation) => void; issue?: HydrationIssue } = {},
): {
  root: ShadowRoot;
  copy: ReturnType<typeof vi.fn>;
} {
  const api = createIssueStore(10, () => undefined);
  api.add(extra.issue ?? makeIssue());
  const copy = vi.fn();
  handle = mountHud({
    document,
    view: window,
    component: HydrationDoctorHUD,
    api,
    attribute: 'data-nhd-loc',
    corner: 'bottom-right',
    autoOpen: true,
    toEntry: (issue) => ({ issue, diff: null, diagnostics }),
    copyText: copy,
    ...(extra.openInEditor === undefined ? {} : { openInEditor: extra.openInEditor }),
    reportInternal: (message, error) => {
      throw new Error(`${message}: ${String(error)}`);
    },
  });
  return { root: required(handle.host.shadowRoot, 'shadow root'), copy };
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  handle?.unmount();
  handle = null;
});

describe('HUD diagnosis section', () => {
  it('shows the cause, a confidence word and number, the evidence and the fix', async () => {
    const { root } = mount([diagnosis()]);
    await nextTick();

    const section = required(root.querySelector('.nhd-diagnoses'), 'diagnoses').textContent;
    expect(section).toContain('Likely cause');
    expect(section).toContain('The current time or date is rendered on both sides');
    expect(section).toContain('High confidence');
    expect(section).toContain('92%');
    expect(section).toContain('The component reads the clock while rendering.');
    expect(section).toContain('Two timestamps 3000 ms apart.');
    expect(section).toContain('Compute the value once on the server');
    expect(root.querySelector('.nhd-code')?.textContent).toBe(
      "const now = useState('now', () => Date.now())",
    );
    expect(root.querySelector('.nhd-code')?.getAttribute('data-language')).toBe('vue');
  });

  it('copies the fix code', async () => {
    const { root, copy } = mount([diagnosis()]);
    await nextTick();

    const button = Array.from(root.querySelectorAll<HTMLElement>('.nhd-fix .nhd-action')).find(
      (candidate) => candidate.textContent.includes('Copy fix'),
    );
    required(button, 'Copy fix button').click();

    expect(copy).toHaveBeenCalledWith("const now = useState('now', () => Date.now())");
  });

  it.each([
    [0.92, 'High confidence'],
    [0.6, 'Medium confidence'],
    [0.35, 'Low confidence'],
  ])('labels a %s confidence as "%s"', async (confidence, label) => {
    const { root } = mount([diagnosis({ confidence })]);
    await nextTick();
    expect(root.querySelector('.nhd-confidence')?.textContent).toContain(label);
  });

  it('lists several causes, most confident first as given', async () => {
    const { root } = mount([
      diagnosis({ category: 'invalid-html-nesting', title: 'Nesting', confidence: 0.95 }),
      diagnosis({ category: 'browser-global-leak', title: 'Globals', confidence: 0.6 }),
    ]);
    await nextTick();
    expect(
      Array.from(root.querySelectorAll('.nhd-diagnosis-title')).map(
        // The title text comes first; the confidence badge is a separate element after it.
        (title) => (title.firstChild?.textContent ?? '').trim(),
      ),
    ).toEqual(['Nesting', 'Globals']);
  });

  it('says so when no pattern matched', async () => {
    const { root } = mount([]);
    await nextTick();
    expect(root.querySelectorAll('.nhd-diagnosis')).toHaveLength(0);
    expect(root.querySelector('.nhd-diagnoses .nhd-note')?.textContent).toContain(
      'No known pattern matched',
    );
  });

  it('renders a diagnosis without a fix and shows hostile text as text', async () => {
    const hostile = '<img src=x onerror="window.__nhd_pwned = true">';
    const { root } = mount([diagnosis({ fix: null, evidence: [hostile], explanation: hostile })]);
    await nextTick();

    expect(root.querySelectorAll('.nhd-fix')).toHaveLength(0);
    expect(root.querySelectorAll('img')).toHaveLength(0);
    expect(root.querySelector('.nhd-diagnoses')?.textContent).toContain('onerror');
    expect((window as unknown as Record<string, unknown>)['__nhd_pwned']).toBeUndefined();
  });
});

describe('HUD Open in editor', () => {
  const button = (root: ShadowRoot): HTMLElement | undefined =>
    Array.from(root.querySelectorAll<HTMLElement>('.nhd-loc .nhd-action')).find((candidate) =>
      candidate.textContent.includes('Open in editor'),
    );

  it('opens the source location of the selected issue', async () => {
    const open = vi.fn();
    const { root } = mount([], { openInEditor: open });
    await nextTick();

    required(button(root), 'Open in editor button').click();

    expect(open).toHaveBeenCalledWith({ file: 'components/Widget.vue', line: 3, column: 5 });
  });

  it('is not offered when no opener was supplied (the dev endpoint is off)', async () => {
    const { root } = mount([]);
    await nextTick();
    expect(button(root)).toBeUndefined();
    // Copy is still there.
    expect(root.querySelector('.nhd-loc')?.textContent).toContain('Copy');
  });

  it('is not offered for an issue without a source location', async () => {
    const { root } = mount([], {
      openInEditor: vi.fn(),
      issue: makeIssue({ location: null, occurrence: null }),
    });
    await nextTick();
    expect(root.querySelector('.nhd-loc')).toBeNull();
    expect(button(root)).toBeUndefined();
  });
});
