/** A run of text on one side of a diff row; `diverges` marks the part that differs. */
export interface DiffSegment {
  readonly text: string;
  readonly diverges: boolean;
}

/**
 * One aligned row of the side-by-side diff.
 * - `same`: both sides match.
 * - `changed`: both sides have a line but they differ (segments say where).
 * - `removed`: only the server has a line.
 * - `added`: only the client has a line.
 * A side that has no line in this row is null.
 */
export interface DiffRow {
  readonly status: 'same' | 'changed' | 'removed' | 'added';
  readonly server: readonly DiffSegment[] | null;
  readonly client: readonly DiffSegment[] | null;
}

export interface HtmlDiff {
  readonly rows: readonly DiffRow[];
  /** True when the two documents are line-for-line identical after normalisation. */
  readonly identical: boolean;
  /** True when an input was cut to the line limit, so the diff is partial. */
  readonly truncated: boolean;
}
