import { createApp, h, shallowReactive, type Component } from 'vue';
import type { HydrationDoctorApi } from '../domain/api';
import type { HudEntry, OverlayBox } from '../domain/hud';
import type { HydrationIssue } from '../domain/issue';
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
  readonly copyText: (text: string) => void;
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
  const shadow = host.attachShadow({ mode: 'open' });
  const container = deps.document.createElement('div');
  shadow.append(container);

  const state = shallowReactive<HudState>({
    entries: [],
    overlays: [],
    selectedId: null,
    open: false,
  });

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
          deps.copyText(text);
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
      tracker.stop();
      deps.document.removeEventListener('keydown', onKeydown);
      app.unmount();
      host.remove();
    },
  };
}
