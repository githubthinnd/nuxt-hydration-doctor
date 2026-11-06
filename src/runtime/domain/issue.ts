/** A position inside a Vue single-file component, 1-based like editors report it. */
export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

/** Vue hydration warnings the interceptor recognises (Phase 3). */
export type HydrationMismatchKind = 'children-mismatch' | 'node-mismatch' | 'text-mismatch';

export interface HydrationMetrics {
  /** Epoch milliseconds at which the warning was captured. */
  readonly detectedAt: number;
  /** Milliseconds between navigation start and the warning, or null when unavailable. */
  readonly msSinceNavigationStart: number | null;
}

/** One hydration mismatch observed during the current browser session. */
export interface HydrationIssue {
  readonly id: string;
  readonly kind: HydrationMismatchKind;
  /** The raw Vue warning text. */
  readonly message: string;
  readonly route: string;
  readonly componentName: string | null;
  /** Null when the offending node has no `data-nhd-loc` ancestor. */
  readonly location: SourceLocation | null;
  /** Markup the server rendered for the mismatched subtree, when it could be recovered. */
  readonly serverHtml: string | null;
  /** Markup the client rendered for the same subtree. */
  readonly clientHtml: string | null;
  /** Steps that led to the mismatch, oldest first (route changes, component names…). */
  readonly breadcrumbs: readonly string[];
  readonly metrics: HydrationMetrics;
}
