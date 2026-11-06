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
  /**
   * Position of the offending element among all elements sharing `location` (one template tag
   * rendered several times, as with v-for). Lets the HUD find the same element again; null when
   * there is no location.
   */
  readonly occurrence: number | null;
  /** Markup the server rendered for the mismatched subtree, when it could be recovered. */
  readonly serverHtml: string | null;
  /** Markup the client rendered for the same subtree. */
  readonly clientHtml: string | null;
  /**
   * Tag names of the offending element's ancestors, outermost first (`['html', 'body', 'div', 'p']`).
   * Needed to spot nesting the browser repairs, such as a `<div>` that ends up inside a `<p>`.
   */
  readonly ancestry: readonly string[];
  /**
   * Compiled `setup`/`render` code of the component Vue was hydrating, as the browser holds it
   * (`Function#toString`), or null when unavailable. Input for the source heuristics.
   */
  readonly componentSource: string | null;
  /** Steps that led to the mismatch, oldest first (route changes, component names…). */
  readonly breadcrumbs: readonly string[];
  readonly metrics: HydrationMetrics;
}
