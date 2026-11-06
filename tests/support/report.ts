import type { DiagnosticResult } from '../../src/runtime/domain/diagnostic';
import type { HydrationReport } from '../../src/runtime/domain/report';
import { makeIssue } from './issue';

export function makeDiagnosis(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    category: 'non-deterministic-value',
    confidence: 0.92,
    title: 'The current time or date is rendered on both sides',
    explanation: 'The component reads the clock while rendering.',
    evidence: ['Two timestamps 3000 ms apart.'],
    fix: {
      language: 'vue',
      description: 'Compute the value once on the server.',
      code: "const now = useState('now', () => Date.now())",
    },
    ...overrides,
  };
}

/** A complete, valid report; override only what a test is about. */
export function makeReport(overrides: Partial<HydrationReport> = {}): HydrationReport {
  return {
    pageLoadId: 'load-1',
    issue: makeIssue({
      serverHtml: '<p>server</p>',
      clientHtml: '<p>client</p>',
      ancestry: ['html', 'body'],
      breadcrumbs: ['route /', 'during initial hydration'],
      metrics: { detectedAt: 1_700_000_000_000, msSinceNavigationStart: 812.4 },
    }),
    diagnostics: [makeDiagnosis()],
    ...overrides,
  };
}
