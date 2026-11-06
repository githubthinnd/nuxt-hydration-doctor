/** The heuristic families the diagnostic engine can recognise (Phase 5). */
export const DIAGNOSTIC_CATEGORIES = [
  'browser-global-leak',
  'non-deterministic-value',
  'invalid-html-nesting',
  'state-desynchronization',
] as const;

export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number];

/** A copy-pasteable remedy for a diagnosed issue. */
export interface FixSuggestion {
  readonly language: 'vue' | 'ts';
  readonly description: string;
  readonly code: string;
}

/** Outcome of one heuristic rule applied to one {@link HydrationIssue}. */
export interface DiagnosticResult {
  readonly category: DiagnosticCategory;
  /** Heuristic certainty between 0 (guess) and 1 (proven by the evidence). */
  readonly confidence: number;
  readonly title: string;
  /** Human-readable root cause. */
  readonly explanation: string;
  /** Concrete observations from the diff or the source that led to this conclusion. */
  readonly evidence: readonly string[];
  readonly fix: FixSuggestion | null;
}
