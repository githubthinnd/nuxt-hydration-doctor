// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HudEntry, OverlayBox } from '../../../src/runtime/domain/hud';
import type { HydrationIssue } from '../../../src/runtime/domain/issue';
import {
  createOverlayTracker,
  resolveIssueElement,
  type OverlayView,
} from '../../../src/runtime/hud/overlay';

const ATTR = 'data-nhd-loc';

function issue(overrides: Partial<HydrationIssue> = {}): HydrationIssue {
  return {
    id: 'nhd-1',
    kind: 'text-mismatch',
    message: 'm',
    route: '/',
    componentName: 'Card',
    location: { file: 'a.vue', line: 3, column: 3 },
    occurrence: 0,
    serverHtml: null,
    clientHtml: null,
    breadcrumbs: [],
    metrics: { detectedAt: 0, msSinceNavigationStart: null },
    ...overrides,
  };
}

const entry = (i: HydrationIssue): HudEntry => ({ issue: i, diff: null });

/** Gives an element a fixed on-screen rectangle (happy-dom performs no layout). */
function place(
  element: Element,
  rect: { top: number; left: number; width: number; height: number },
): void {
  element.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  });
}

function body(html: string): void {
  document.body.innerHTML = html;
}

/** A window double with a manual animation-frame queue and recorded listeners. */
function fakeView(): OverlayView & {
  frames: (() => void)[];
  listeners: { type: string; capture: unknown }[];
  runFrames(): void;
  fire(type: 'scroll' | 'resize'): void;
} {
  const handlers = new Map<string, () => void>();
  const frames: (() => void)[] = [];
  const listeners: { type: string; capture: unknown }[] = [];
  return {
    frames,
    listeners,
    addEventListener(type, listener, options) {
      handlers.set(type, listener);
      listeners.push({ type, capture: options });
    },
    removeEventListener(type) {
      handlers.delete(type);
    },
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame() {
      frames.length = 0;
    },
    runFrames() {
      const pending = frames.splice(0);
      for (const frame of pending) frame();
    },
    fire(type) {
      handlers.get(type)?.();
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('resolveIssueElement', () => {
  it('returns the occurrence-th element that carries the issue location', () => {
    body(
      '<li data-nhd-loc="a.vue:3:3">a</li><li data-nhd-loc="b.vue:1:1">x</li><li data-nhd-loc="a.vue:3:3">b</li>',
    );
    const second = resolveIssueElement(document, ATTR, issue({ occurrence: 1 }));
    expect(second?.textContent).toBe('b');
  });

  it('falls back to the first match when the occurrence is out of range or unknown', () => {
    body('<li data-nhd-loc="a.vue:3:3">a</li>');
    expect(resolveIssueElement(document, ATTR, issue({ occurrence: 5 }))?.textContent).toBe('a');
    expect(resolveIssueElement(document, ATTR, issue({ occurrence: null }))?.textContent).toBe('a');
  });

  it('returns null without a location or without a match', () => {
    body('<li data-nhd-loc="other.vue:1:1">a</li>');
    expect(
      resolveIssueElement(document, ATTR, issue({ location: null, occurrence: null })),
    ).toBeNull();
    expect(resolveIssueElement(document, ATTR, issue())).toBeNull();
  });
});

describe('createOverlayTracker', () => {
  it('computes one viewport box per issue immediately', () => {
    body('<p data-nhd-loc="a.vue:3:3">x</p>');
    place(document.querySelector('p') as Element, { top: 10, left: 20, width: 100, height: 30 });
    const onChange = vi.fn<(boxes: readonly OverlayBox[]) => void>();
    const tracker = createOverlayTracker({ document, view: fakeView(), attribute: ATTR, onChange });

    tracker.setEntries([entry(issue())]);

    expect(onChange).toHaveBeenCalledWith([
      { issueId: 'nhd-1', top: 10, left: 20, width: 100, height: 30 },
    ]);
  });

  it('skips hidden elements (zero size) and issues that cannot be found', () => {
    body('<p data-nhd-loc="a.vue:3:3">x</p>');
    place(document.querySelector('p') as Element, { top: 0, left: 0, width: 0, height: 0 });
    const onChange = vi.fn();
    const tracker = createOverlayTracker({ document, view: fakeView(), attribute: ATTR, onChange });

    tracker.setEntries([
      entry(issue()),
      entry(issue({ id: 'nhd-2', location: null, occurrence: null })),
    ]);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('follows the element when the page scrolls, coalescing work into one frame', () => {
    body('<p data-nhd-loc="a.vue:3:3">x</p>');
    const p = document.querySelector('p') as Element;
    place(p, { top: 10, left: 0, width: 50, height: 20 });
    const view = fakeView();
    const onChange = vi.fn<(boxes: readonly OverlayBox[]) => void>();
    const tracker = createOverlayTracker({ document, view, attribute: ATTR, onChange });
    tracker.setEntries([entry(issue())]);

    place(p, { top: -90, left: 0, width: 50, height: 20 });
    view.fire('scroll');
    view.fire('scroll');
    view.fire('resize');
    expect(view.frames).toHaveLength(1);
    view.runFrames();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith([
      { issueId: 'nhd-1', top: -90, left: 0, width: 50, height: 20 },
    ]);
  });

  it('does not notify when nothing moved', () => {
    body('<p data-nhd-loc="a.vue:3:3">x</p>');
    place(document.querySelector('p') as Element, { top: 1, left: 1, width: 5, height: 5 });
    const view = fakeView();
    const onChange = vi.fn();
    const tracker = createOverlayTracker({ document, view, attribute: ATTR, onChange });
    tracker.setEntries([entry(issue())]);

    view.fire('scroll');
    view.runFrames();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('listens for scroll in the capture phase so nested scrollers count', () => {
    const view = fakeView();
    createOverlayTracker({ document, view, attribute: ATTR, onChange: () => undefined });
    expect(view.listeners.find((l) => l.type === 'scroll')?.capture).toBe(true);
  });

  it('watches element and document size when a resize observer is supplied, and stops cleanly', () => {
    body('<p data-nhd-loc="a.vue:3:3">x</p>');
    place(document.querySelector('p') as Element, { top: 1, left: 1, width: 5, height: 5 });
    const stops: ReturnType<typeof vi.fn>[] = [];
    const observed: Element[] = [];
    const view = fakeView();
    const tracker = createOverlayTracker({
      document,
      view,
      attribute: ATTR,
      onChange: () => undefined,
      observeResize: (element) => {
        observed.push(element);
        const stop = vi.fn();
        stops.push(stop);
        return stop;
      },
    });
    tracker.setEntries([entry(issue())]);

    expect(observed).toEqual([document.documentElement, document.querySelector('p')]);
    tracker.stop();
    expect(stops.every((stop) => stop.mock.calls.length === 1)).toBe(true);

    view.fire('scroll');
    expect(view.frames).toHaveLength(0);
  });
});
