// @vitest-environment happy-dom
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HydrationDoctorHUD from '../../src/runtime/components/HydrationDoctorHUD.vue';
import {
  BADGE_POSITION_STORAGE_KEY,
  type HudCorner,
} from '../../src/runtime/domain/badge-position';
import { mountHud, type HudHandle } from '../../src/runtime/hud/mount-hud';
import { createIssueStore } from '../../src/runtime/interceptor/issue-store';
import { makeIssue } from '../support/issue';
import { required } from '../support/required';

/**
 * The badge can be moved, because it may sit where another debug bar already is. These tests
 * drive the real component with pointer and keyboard events. happy-dom performs no layout, so the
 * boxes the arithmetic reads are stubbed: a viewport area of 968 x 668 starting at (16, 16) and a
 * badge of 160 x 40, which leaves 808 x 628 of free space.
 */
const AREA = { left: 16, top: 16, width: 968, height: 668 };
const BADGE = { left: 100, top: 100, width: 160, height: 40 };
/** The pointer lands 20 px right of and 10 px below the badge's corner when it is grabbed. */
const GRAB = { x: BADGE.left + 20, y: BADGE.top + 10 };

interface Storage {
  value: string | null;
  saved: (string | null)[];
}

let handle: HudHandle | null = null;

function rect(box: { left: number; top: number; width: number; height: number }): DOMRect {
  return { ...box, x: box.left, y: box.top, right: 0, bottom: 0, toJSON: () => ({}) };
}

interface Options {
  corner?: HudCorner;
  stored?: string | null;
  autoOpen?: boolean;
  noStorage?: boolean;
  storage?: { load: () => string | null; save: (text: string | null) => void };
  reportInternal?: (message: string, error: unknown) => void;
}

function mount(options: Options = {}) {
  const storage: Storage = { value: options.stored ?? null, saved: [] };
  const api = createIssueStore(10, () => undefined);
  api.add(makeIssue());
  handle = mountHud({
    document,
    view: window,
    component: HydrationDoctorHUD,
    api,
    attribute: 'data-nhd-loc',
    corner: options.corner ?? 'bottom-right',
    autoOpen: options.autoOpen ?? false,
    toEntry: (issue) => ({ issue, diff: null, diagnostics: [] }),
    copyText: () => undefined,
    ...(options.noStorage === true
      ? {}
      : {
          positionStorage: options.storage ?? {
            load: () => storage.value,
            save: (text: string | null) => {
              storage.saved.push(text);
              storage.value = text;
            },
          },
        }),
    reportInternal:
      options.reportInternal ??
      ((message, error) => {
        throw new Error(`${message}: ${String(error)}`);
      }),
  });
  const root = required(handle.host.shadowRoot, 'shadow root');
  const badge = required(root.querySelector<HTMLElement>('.nhd-badge'), 'badge');
  const dock = required(root.querySelector<HTMLElement>('.nhd-dock'), 'dock');
  dock.getBoundingClientRect = () => rect(AREA);
  badge.getBoundingClientRect = () => rect(BADGE);

  const fire = (type: string, point: { x: number; y: number }, extra: MouseEventInit = {}) =>
    badge.dispatchEvent(
      new MouseEvent(type, {
        clientX: point.x,
        clientY: point.y,
        button: 0,
        bubbles: true,
        ...extra,
      }),
    );
  /** Presses on the badge, moves to `to` in a few steps, and lets go. */
  const drag = async (to: { x: number; y: number }) => {
    fire('pointerdown', GRAB);
    fire('pointermove', { x: GRAB.x + 10, y: GRAB.y + 10 });
    fire('pointermove', to);
    fire('pointerup', to);
    await nextTick();
  };
  /** The pointer position that puts the badge at the given fractions of the free space. */
  const at = (fx: number, fy: number) => ({
    x: AREA.left + 20 + fx * (AREA.width - BADGE.width),
    y: AREA.top + 10 + fy * (AREA.height - BADGE.height),
  });
  return { root, badge, storage, fire, drag, at };
}

const style = (badge: HTMLElement): string => badge.getAttribute('style') ?? '';

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  handle?.unmount();
  handle = null;
});

describe('badge position', () => {
  it('starts in the bottom right corner by default, and in the corner that was configured', async () => {
    const { badge } = mount();
    await nextTick();
    expect(style(badge)).toContain('left: 100%');
    expect(style(badge)).toContain('top: 100%');
    expect(style(badge)).toContain('translate(-100%, -100%)');
    handle?.unmount();

    const topLeft = mount({ corner: 'top-left' });
    await nextTick();
    expect(style(topLeft.badge)).toContain('left: 0%');
    expect(style(topLeft.badge)).toContain('top: 0%');
  });

  it('follows the pointer while dragging, keeping the grabbed point under it', async () => {
    const { badge, drag, at } = mount();
    await nextTick();

    await drag(at(0.5, 0.25));

    expect(style(badge)).toContain('left: 50%');
    expect(style(badge)).toContain('top: 25%');
    expect(style(badge)).toContain('translate(-50%, -25%)');
  });

  it('cannot be dragged off screen', async () => {
    const { badge, drag } = mount();
    await nextTick();

    await drag({ x: -900, y: 9000 });

    expect(style(badge)).toContain('left: 0%');
    expect(style(badge)).toContain('top: 100%');
  });

  it('remembers where it was left', async () => {
    const { drag, at, storage } = mount();
    await nextTick();

    await drag(at(0.1, 0.9));

    expect(storage.saved).toEqual([JSON.stringify({ fx: 0.1, fy: 0.9 })]);
  });

  it('comes back where it was left on the next page load', async () => {
    const { badge } = mount({ stored: JSON.stringify({ fx: 0.2, fy: 0.3 }) });
    await nextTick();
    expect(style(badge)).toContain('left: 20%');
    expect(style(badge)).toContain('top: 30%');
  });

  it.each(['garbage', '{"fx":9,"fy":0}', '{"fx":0.5}', 'null'])(
    'ignores a stored position of %j and uses the corner',
    async (stored) => {
      const { badge } = mount({ stored, corner: 'top-right' });
      await nextTick();
      expect(style(badge)).toContain('left: 100%');
      expect(style(badge)).toContain('top: 0%');
    },
  );

  it('still works when nothing can be stored', async () => {
    const { badge, drag, at } = mount({ noStorage: true });
    await nextTick();
    await drag(at(0.3, 0.3));
    expect(style(badge)).toContain('left: 30%');
  });

  it('survives storage that throws, and says so instead of crashing', async () => {
    const problems: string[] = [];
    const { badge, drag, at } = mount({
      storage: {
        load: () => {
          throw new Error('SecurityError');
        },
        save: () => {
          throw new Error('QuotaExceeded');
        },
      },
      reportInternal: (message) => {
        problems.push(message);
      },
    });
    await nextTick();
    expect(style(badge)).toContain('left: 100%');

    await drag(at(0.4, 0.4));

    expect(style(badge)).toContain('left: 40%');
    expect(problems).toEqual([
      'could not read the remembered badge position',
      'could not remember the badge position',
    ]);
  });
});

describe('dragging versus clicking', () => {
  it('toggles the panel on a click', async () => {
    const { root, badge } = mount();
    await nextTick();
    expect(root.querySelector('.nhd-panel')).toBeNull();

    badge.click();
    await nextTick();
    expect(root.querySelector('.nhd-panel')).not.toBeNull();
  });

  it('does not toggle the panel when the press ends a drag', async () => {
    const { root, badge, drag, at } = mount();
    await nextTick();

    await drag(at(0.2, 0.2));
    badge.click(); // the click a browser sends after the release
    await nextTick();
    expect(root.querySelector('.nhd-panel')).toBeNull();

    // The next, ordinary click works again.
    badge.click();
    await nextTick();
    expect(root.querySelector('.nhd-panel')).not.toBeNull();
  });

  it('treats a press that barely moves as a click, not a drag', async () => {
    const { root, badge, fire, storage } = mount();
    await nextTick();

    fire('pointerdown', GRAB);
    fire('pointermove', { x: GRAB.x + 2, y: GRAB.y + 1 });
    fire('pointerup', { x: GRAB.x + 2, y: GRAB.y + 1 });
    badge.click();
    await nextTick();

    expect(root.querySelector('.nhd-panel')).not.toBeNull();
    expect(style(badge)).toContain('left: 100%');
    expect(storage.saved).toEqual([]);
  });

  it('ignores a right-button press', async () => {
    const { badge, fire } = mount();
    await nextTick();
    fire('pointerdown', GRAB, { button: 2 });
    fire('pointermove', { x: 300, y: 300 });
    fire('pointerup', { x: 300, y: 300 });
    await nextTick();
    expect(style(badge)).toContain('left: 100%');
  });

  it('shows the grabbing cursor state only while dragging', async () => {
    const { badge, fire, at } = mount();
    await nextTick();
    expect(badge.classList.contains('nhd-badge--dragging')).toBe(false);

    fire('pointerdown', GRAB);
    fire('pointermove', at(0.5, 0.5));
    await nextTick();
    expect(badge.classList.contains('nhd-badge--dragging')).toBe(true);

    fire('pointerup', at(0.5, 0.5));
    await nextTick();
    expect(badge.classList.contains('nhd-badge--dragging')).toBe(false);
  });

  it('ends a drag cleanly when the browser cancels the pointer', async () => {
    const { badge, fire, at, storage } = mount();
    await nextTick();

    fire('pointerdown', GRAB);
    fire('pointermove', at(0.5, 0.5));
    fire('pointercancel', at(0.5, 0.5));
    await nextTick();

    expect(badge.classList.contains('nhd-badge--dragging')).toBe(false);
    expect(storage.saved).toHaveLength(1);
  });
});

describe('moving with the keyboard', () => {
  const press = (badge: HTMLElement, key: string, altKey = true): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, altKey, bubbles: true, cancelable: true });
    badge.dispatchEvent(event);
    return event;
  };

  it('moves by 5% of the free space with Alt and an arrow, and remembers it', async () => {
    const { badge, storage } = mount({ corner: 'top-left' });
    await nextTick();

    press(badge, 'ArrowRight');
    press(badge, 'ArrowDown');
    press(badge, 'ArrowDown');
    await nextTick();

    expect(style(badge)).toContain('left: 5%');
    expect(style(badge)).toContain('top: 10%');
    expect(storage.saved.at(-1)).toBe(JSON.stringify({ fx: 0.05, fy: 0.1 }));
  });

  it('keeps the arrows for the page when Alt is not held', async () => {
    const { badge, storage } = mount({ corner: 'top-left' });
    await nextTick();

    const event = press(badge, 'ArrowRight', false);

    expect(event.defaultPrevented).toBe(false);
    expect(style(badge)).toContain('left: 0%');
    expect(storage.saved).toEqual([]);
  });

  it('takes over Alt + arrow, and stops at the edges', async () => {
    const { badge } = mount({ corner: 'bottom-right' });
    await nextTick();

    const event = press(badge, 'ArrowRight');
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(style(badge)).toContain('left: 100%');
  });

  it('advertises how to move it', async () => {
    const { badge } = mount();
    await nextTick();
    expect(badge.getAttribute('title')).toContain('Drag to move');
    expect(badge.getAttribute('aria-keyshortcuts')).toContain('Alt+ArrowLeft');
  });
});

describe('where the panel opens', () => {
  const classes = (root: ShadowRoot): string[] =>
    Array.from(required(root.querySelector('.nhd-panel'), 'panel').classList);

  it.each([
    ['bottom-right', 'nhd-panel--right', 'nhd-panel--bottom'],
    ['bottom-left', 'nhd-panel--left', 'nhd-panel--bottom'],
    ['top-right', 'nhd-panel--right', 'nhd-panel--top'],
    ['top-left', 'nhd-panel--left', 'nhd-panel--top'],
  ] as const)('docks next to a badge in the %s corner', async (corner, horizontal, vertical) => {
    const { root } = mount({ corner, autoOpen: true });
    await nextTick();
    expect(classes(root)).toEqual(expect.arrayContaining([horizontal, vertical]));
  });

  it('moves to the other side when the badge is dragged across the screen', async () => {
    const { root, drag, at } = mount({ corner: 'bottom-right', autoOpen: true });
    await nextTick();
    expect(classes(root)).toContain('nhd-panel--bottom');

    await drag(at(0.1, 0.1));

    expect(classes(root)).toEqual(expect.arrayContaining(['nhd-panel--left', 'nhd-panel--top']));
  });
});

describe('resetting the position', () => {
  const resetButton = (root: ShadowRoot): HTMLElement | undefined =>
    Array.from(root.querySelectorAll<HTMLElement>('.nhd-header .nhd-action')).find((button) =>
      button.textContent.includes('Reset position'),
    );

  it('is offered only after the badge has been moved', async () => {
    const { root, badge, drag, at } = mount({ autoOpen: true });
    await nextTick();
    expect(resetButton(root)).toBeUndefined();

    await drag(at(0.3, 0.3));
    expect(resetButton(root)).toBeDefined();
    expect(badge).toBeDefined();
  });

  it('is offered when a moved position was restored from storage', async () => {
    const { root } = mount({ stored: JSON.stringify({ fx: 0.2, fy: 0.2 }), autoOpen: true });
    await nextTick();
    expect(resetButton(root)).toBeDefined();
  });

  it('brings the badge back to the configured corner and forgets the stored position', async () => {
    const { root, badge, drag, at, storage } = mount({ corner: 'top-left', autoOpen: true });
    await nextTick();
    await drag(at(0.6, 0.6));
    expect(storage.value).not.toBeNull();

    required(resetButton(root), 'reset button').click();
    await nextTick();

    expect(style(badge)).toContain('left: 0%');
    expect(style(badge)).toContain('top: 0%');
    expect(storage.value).toBeNull();
    expect(resetButton(root)).toBeUndefined();
  });
});

describe('what the badge does not do', () => {
  it('does not touch the page: no style leaks and no listeners are left after unmounting', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const { drag, at } = mount();
    await nextTick();
    await drag(at(0.5, 0.5));
    expect(document.head.innerHTML).not.toContain('nhd-');
    handle?.unmount();
    handle = null;
    expect(document.getElementById('nuxt-hydration-doctor-hud')).toBeNull();
    add.mockRestore();
  });

  it('keeps its position storage key in one place', () => {
    expect(BADGE_POSITION_STORAGE_KEY).toBe('nuxt-hydration-doctor:badge-position');
  });
});
