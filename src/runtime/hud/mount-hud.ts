import { createApp, h, shallowReactive, type Component } from 'vue';
import type { HydrationDoctorApi } from '../domain/api';
import {
  cornerPosition,
  parseStoredPosition,
  samePosition,
  serializePosition,
  type BadgePosition,
  type HudCorner,
} from '../domain/badge-position';
import type { HudEntry, OverlayBox } from '../domain/hud';
import type { HydrationIssue, SourceLocation } from '../domain/issue';
import { createOverlayTracker, type OverlayView } from './overlay';

export const HUD_HOST_ID = 'nuxt-hydration-doctor-hud';

export interface HudDeps {
  readonly document: Document;
  readonly view: OverlayView;
  /** The HUD component; it renders inside the shadow root. */
  readonly component: Component;
  readonly api: HydrationDoctorApi;
  readonly attribute: string;
  /** Open the panel on the first captured issue. */
  readonly autoOpen: boolean;
  /** Builds the HUD's view of an issue (including its diff). */
  readonly toEntry: (issue: HydrationIssue) => HudEntry;
  /** Copies text; resolves to whether it worked (nothing returned counts as worked). */
  readonly copyText: (text: string) => Promise<boolean> | undefined;
  /**
   * Opens a source location in the editor. Absent when that is not possible (the dev endpoint it
   * goes through is off), in which case the HUD does not offer the button.
   */
  readonly openInEditor?: (location: SourceLocation) => void;
  /** Corner the badge starts in and returns to on "Reset position". */
  readonly corner: HudCorner;
  /**
   * Where the badge's position is remembered between page loads. Absent when nothing can be
   * stored; the position is then kept for this page load only. `save(null)` forgets it.
   */
  readonly positionStorage?: {
    load(): string | null;
    save(text: string | null): void;
  };
  readonly observeResize?: (element: Element, callback: () => void) => () => void;
  /** Receives the module's own failures; must never throw. */
  readonly reportInternal: (message: string, error: unknown) => void;
}

export interface HudHandle {
  /** The element holding the shadow root. */
  readonly host: HTMLElement;
  unmount(): void;
}

interface HudState {
  entries: readonly HudEntry[];
  overlays: readonly OverlayBox[];
  selectedId: string | null;
  open: boolean;
  position: BadgePosition;
  /** A short message about the last copy, shown for a moment. */
  notice: { readonly text: string; readonly ok: boolean } | null;
}

/**
 * Mounts the HUD into a Shadow DOM root attached to a host element on `document.body`.
 *
 * The shadow root is the isolation boundary: the page's CSS cannot restyle the HUD and the HUD's
 * CSS cannot leak into the page. The host itself is reset with `all: initial` and covers the
 * viewport with `pointer-events: none`, so only the HUD's own controls receive clicks. The HUD is
 * a separate Vue app placed outside the application's root element, so it is never part of the
 * hydrated tree and cannot cause or hide a mismatch.
 */
export function mountHud(deps: HudDeps): HudHandle {
  const host = deps.document.createElement('div');
  host.id = HUD_HOST_ID;
  host.setAttribute(
    'style',
    'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;',
  );
  /** The remembered position if there is a valid one, else the starting corner. */
  function initialPosition(): BadgePosition {
    try {
      const stored = parseStoredPosition(deps.positionStorage?.load() ?? null);
      if (stored !== null) return stored;
    } catch (error) {
      // Storage can throw (blocked, private mode); the corner is a fine answer.
      deps.reportInternal('could not read the remembered badge position', error);
    }
    return cornerPosition(deps.corner);
  }

  function remember(text: string | null): void {
    try {
      deps.positionStorage?.save(text);
    } catch (error) {
      deps.reportInternal('could not remember the badge position', error);
    }
  }

  const shadow = host.attachShadow({ mode: 'open' });
  const container = deps.document.createElement('div');
  shadow.append(container);

  const state = shallowReactive<HudState>({
    entries: [],
    overlays: [],
    selectedId: null,
    open: false,
    position: initialPosition(),
    notice: null,
  });

  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  function showNotice(text: string, ok: boolean): void {
    state.notice = { text, ok };
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      state.notice = null;
    }, 2200);
  }

  const tracker = createOverlayTracker({
    document: deps.document,
    view: deps.view,
    attribute: deps.attribute,
    onChange: (boxes) => {
      state.overlays = boxes;
    },
    ...(deps.observeResize === undefined ? {} : { observeResize: deps.observeResize }),
  });

  function addIssue(issue: HydrationIssue): void {
    const first = state.entries.length === 0;
    try {
      state.entries = [...state.entries, deps.toEntry(issue)];
    } catch (error) {
      deps.reportInternal('could not build the HUD view of an issue', error);
      return;
    }
    state.selectedId ??= issue.id;
    if (first && deps.autoOpen) state.open = true;
    tracker.setEntries(state.entries);
  }

  for (const issue of deps.api.issues()) addIssue(issue);
  const unsubscribe = deps.api.subscribe(addIssue);

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && state.open) state.open = false;
  };
  deps.document.addEventListener('keydown', onKeydown);

  const app = createApp({
    render: () =>
      h(deps.component, {
        entries: state.entries,
        overlays: state.overlays,
        selectedId: state.selectedId,
        open: state.open,
        canOpen: deps.openInEditor !== undefined,
        position: state.position,
        notice: state.notice,
        customPosition: !samePosition(state.position, cornerPosition(deps.corner)),
        onMove: (position: BadgePosition) => {
          state.position = position;
        },
        onMoveEnd: () => {
          remember(serializePosition(state.position));
        },
        onResetPosition: () => {
          state.position = cornerPosition(deps.corner);
          remember(null);
        },
        onSelect: (id: string) => {
          state.selectedId = id;
          state.open = true;
        },
        onToggle: () => {
          state.open = !state.open;
        },
        onClose: () => {
          state.open = false;
        },
        onClear: () => {
          deps.api.clear();
          state.entries = [];
          state.selectedId = null;
          tracker.setEntries([]);
        },
        onCopy: (text: string) => {
          void Promise.resolve(deps.copyText(text)).then(
            (copied) => {
              if (copied === false) showNotice('Could not copy', false);
              else showNotice('Copied to clipboard', true);
            },
            () => {
              showNotice('Could not copy', false);
            },
          );
        },
        onOpen: (location: SourceLocation) => {
          deps.openInEditor?.(location);
        },
      }),
  });
  app.config.errorHandler = (error) => {
    deps.reportInternal('the HUD failed to render', error);
  };

  deps.document.body.append(host);
  app.mount(container);

  return {
    host,
    unmount() {
      unsubscribe();
      clearTimeout(noticeTimer);
      tracker.stop();
      deps.document.removeEventListener('keydown', onKeydown);
      app.unmount();
      host.remove();
    },
  };
}
