import type { HudEntry, OverlayBox } from '../domain/hud';
import type { HydrationIssue } from '../domain/issue';
import { formatSourceLocation } from '../domain/location';

/** The window features the tracker needs; structural so tests can supply a double. */
export interface OverlayView {
  addEventListener(
    type: 'scroll' | 'resize',
    listener: () => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: 'scroll' | 'resize',
    listener: () => void,
    options?: boolean | EventListenerOptions,
  ): void;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(handle: number): void;
}

export interface OverlayDeps {
  readonly document: Document;
  readonly view: OverlayView;
  /** Attribute written by the AST injector. */
  readonly attribute: string;
  /** Called with the new boxes, only when they changed. */
  readonly onChange: (boxes: readonly OverlayBox[]) => void;
  /** Watches an element's size; returns a stop function. Absent where ResizeObserver is. */
  readonly observeResize?: (element: Element, callback: () => void) => () => void;
}

export interface OverlayTracker {
  /** Sets the issues to outline and recomputes immediately. */
  setEntries(entries: readonly HudEntry[]): void;
  /** Recomputes on the next animation frame (coalesced). */
  refresh(): void;
  stop(): void;
}

/**
 * Finds the live element an issue points at: the `occurrence`-th element carrying the issue's
 * location. Resolved on every update instead of being remembered, because Vue may replace or
 * move the element afterwards.
 */
export function resolveIssueElement(
  doc: Document,
  attribute: string,
  issue: HydrationIssue,
): Element | null {
  if (issue.location === null) return null;
  const value = formatSourceLocation(issue.location);
  const matches = Array.from(doc.querySelectorAll(`[${attribute}]`)).filter(
    (candidate) => candidate.getAttribute(attribute) === value,
  );
  return matches[issue.occurrence ?? 0] ?? matches[0] ?? null;
}

function sameBoxes(a: readonly OverlayBox[], b: readonly OverlayBox[]): boolean {
  return (
    a.length === b.length &&
    a.every((box, index) => {
      const other = b[index];
      return (
        box.issueId === other?.issueId &&
        box.top === other.top &&
        box.left === other.left &&
        box.width === other.width &&
        box.height === other.height
      );
    })
  );
}

/**
 * Keeps one viewport-relative box per issue in sync with the element it outlines.
 *
 * Boxes are `position: fixed` rectangles, so they only need updating when something can move the
 * element on screen: scrolling (any scroller, hence the capturing listener), resizing the window
 * or the element, or the layout above it changing (the document element is watched too). Work is
 * coalesced into one animation frame, and `onChange` fires only for a real change so a reactive
 * consumer is not re-rendered 60 times a second. Elements that are hidden (zero size) get no box.
 */
export function createOverlayTracker(deps: OverlayDeps): OverlayTracker {
  let entries: readonly HudEntry[] = [];
  let boxes: readonly OverlayBox[] = [];
  let frame: number | null = null;
  let stopObservers: (() => void)[] = [];

  function compute(): void {
    const next: OverlayBox[] = [];
    for (const { issue } of entries) {
      const element = resolveIssueElement(deps.document, deps.attribute, issue);
      if (element === null) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      next.push({
        issueId: issue.id,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    }
    if (sameBoxes(boxes, next)) return;
    boxes = next;
    deps.onChange(next);
  }

  function refresh(): void {
    if (frame !== null) return;
    frame = deps.view.requestAnimationFrame(() => {
      frame = null;
      compute();
    });
  }

  const onViewportChange = (): void => {
    refresh();
  };
  deps.view.addEventListener('scroll', onViewportChange, true);
  deps.view.addEventListener('resize', onViewportChange);

  function observe(): void {
    for (const stop of stopObservers) stop();
    stopObservers = [];
    const { observeResize } = deps;
    if (observeResize === undefined) return;
    const targets = [
      deps.document.documentElement,
      ...entries.flatMap(
        ({ issue }) => resolveIssueElement(deps.document, deps.attribute, issue) ?? [],
      ),
    ];
    for (const target of targets) stopObservers.push(observeResize(target, refresh));
  }

  return {
    setEntries(next) {
      entries = next;
      observe();
      compute();
    },
    refresh,
    stop() {
      deps.view.removeEventListener('scroll', onViewportChange, true);
      deps.view.removeEventListener('resize', onViewportChange);
      if (frame !== null) deps.view.cancelAnimationFrame(frame);
      frame = null;
      for (const stop of stopObservers) stop();
      stopObservers = [];
    },
  };
}
