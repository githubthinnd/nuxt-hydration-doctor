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

/** A value read from the live browser; the engine looks for it inside text the server could not know. */
export interface BrowserValue {
  /** Where it comes from, e.g. `window.innerWidth` or `localStorage["theme"]`. Shown to the user. */
  readonly source: string;
  /**
   * The value itself. Only compared with the page's text, never listed on its own (a storage
   * value may be a token). Text of the page that happens to contain it is already in the diff.
   */
  readonly value: string;
}

/** A piece of reactive state whose value changed between the server payload and hydration. */
export interface StateChange {
  readonly store: 'useState' | 'pinia';
  readonly key: string;
  /** Serialised value from the server payload. Used for matching only, never listed. */
  readonly before: string;
  /** Serialised value now. Used for matching only, never listed. */
  readonly after: string;
}

/** Facts about the running page that the heuristics may use besides the issue itself. */
export interface DiagnosticContext {
  readonly browserValues: readonly BrowserValue[];
  readonly stateChanges: readonly StateChange[];
  /** Categories the user switched off. */
  readonly disabledCategories: readonly DiagnosticCategory[];
}
