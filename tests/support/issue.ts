import type { DiagnosticContext } from '../../src/runtime/domain/diagnostic';
import type { HydrationIssue } from '../../src/runtime/domain/issue';

/** A complete issue with neutral values; override only what a test is about. */
export function makeIssue(overrides: Partial<HydrationIssue> = {}): HydrationIssue {
  return {
    id: 'nhd-1',
    kind: 'text-mismatch',
    message: 'Hydration text content mismatch',
    route: '/',
    componentName: 'Widget',
    location: { file: 'components/Widget.vue', line: 3, column: 5 },
    occurrence: 0,
    serverHtml: null,
    clientHtml: null,
    ancestry: [],
    componentSource: null,
    breadcrumbs: [],
    metrics: { detectedAt: 0, msSinceNavigationStart: null },
    ...overrides,
  };
}

/** A context with no extra facts. */
export function makeContext(overrides: Partial<DiagnosticContext> = {}): DiagnosticContext {
  return { browserValues: [], stateChanges: [], disabledCategories: [], ...overrides };
}

/** Server/client markup for a one-element text mismatch, as the interceptor would capture it. */
export function textMismatch(server: string, client: string, tag = 'p'): Partial<HydrationIssue> {
  return {
    serverHtml: `<${tag} data-nhd-loc="components/Widget.vue:3:5">${server}</${tag}>`,
    clientHtml: `<${tag} data-nhd-loc="components/Widget.vue:3:5">${client}</${tag}>`,
  };
}
