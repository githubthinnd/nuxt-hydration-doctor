import type { DiagnosticResult } from './diagnostic';
import type { HtmlDiff } from './diff';
import type { HydrationIssue } from './issue';

/** One issue as the HUD shows it: the issue plus its precomputed diff (null when a side is missing). */
export interface HudEntry {
  readonly issue: HydrationIssue;
  readonly diff: HtmlDiff | null;
  /** Likely causes, most confident first. */
  readonly diagnostics: readonly DiagnosticResult[];
}

/** Viewport rectangle (fixed positioning) of the element an issue points at. */
export interface OverlayBox {
  readonly issueId: string;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}
