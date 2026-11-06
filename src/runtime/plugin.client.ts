import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { createReporter } from './bridge/reporter';
import { BADGE_POSITION_STORAGE_KEY } from './domain/badge-position';
import {
  DEVTOOLS_BASE_PATH,
  DEVTOOLS_CLIENT_HEADER,
  DEVTOOLS_ISSUES_PATH,
  INTERNAL_LOG_PREFIX,
  RUNTIME_CONFIG_KEY,
} from './domain/constants';
import { parseRuntimeOptions } from './domain/options';
import HydrationDoctorHUD from './components/HydrationDoctorHUD.vue';
import { diagnoseIssue } from './engine/diagnostics';
import { diffHtml } from './engine/html-diff';
import { mountHud } from './hud/mount-hud';
import { collectBrowserValues } from './interceptor/environment';
import { createInterceptor } from './interceptor/interceptor';
import { installWarnHandler } from './interceptor/install';
import { captureServerSnapshot } from './interceptor/snapshot';
import { createStateWatcher, entriesFromPayload } from './interceptor/state-watch';
import type { HydrationDoctorApi } from './domain/api';
import type { HudEntry } from './domain/hud';
import type { HydrationIssue, SourceLocation } from './domain/issue';

/** Server markup larger than this is not copied: the snapshot is a dev convenience, not a must. */
const MAX_SNAPSHOT_CHARS = 2_000_000;
/** Completes pending captures even if `app:mounted` never fires (a crashed hydration, say). */
const SAFETY_FLUSH_MS = 5000;

/**
 * Remembers where the badge was left. Reading or writing can throw (storage blocked, private
 * mode); the HUD catches that and carries on with the position it has.
 */
const positionStorage = {
  load: (): string | null => localStorage.getItem(BADGE_POSITION_STORAGE_KEY),
  save: (text: string | null): void => {
    if (text === null) localStorage.removeItem(BADGE_POSITION_STORAGE_KEY);
    else localStorage.setItem(BADGE_POSITION_STORAGE_KEY, text);
  },
};

/**
 * Copies text and says whether it worked. The async Clipboard API only exists in secure contexts
 * (HTTPS or localhost), so a dev server opened through a LAN address needs the older
 * `execCommand` route, which works from inside a user gesture.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if ('clipboard' in navigator) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or no focus: fall through to the older route.
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position: fixed; top: 0; left: 0; opacity: 0; pointer-events: none;';
    document.body.append(field);
    field.select();
    // Deprecated, but the only way to copy where the Clipboard API is missing (non-HTTPS origins).
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  } catch {
    return false;
  }
}

/** Asks the dev endpoint to open `location` in the editor (it redirects to Nuxt's own route). */
function openInEditor(location: SourceLocation): void {
  const query = new URLSearchParams({
    file: location.file,
    line: String(location.line),
    column: String(location.column),
  });
  fetch(`${DEVTOOLS_BASE_PATH}/open?${query.toString()}`, {
    headers: { [DEVTOOLS_CLIENT_HEADER]: '1' },
  }).catch(() => undefined);
}

function observeResize(element: Element, callback: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  const observer = new ResizeObserver(callback);
  observer.observe(element);
  return () => {
    observer.disconnect();
  };
}

/** `#id` for a plain id from the Nuxt config, or the default when it is missing or odd. */
function idSelector(id: unknown, fallback: string): string {
  return typeof id === 'string' && /^[\w-]+$/.test(id) ? `#${id}` : fallback;
}

/**
 * Composition root of the browser runtime.
 *
 * Registered by the module in development only (see `src/module.ts`), so production bundles
 * never contain it. It must never break the host application: every entry point below is
 * wrapped so a failure inside the doctor degrades to a prefixed console message.
 *
 * `enforce: 'pre'` makes it run before other plugins: the server markup has to be snapshotted
 * before hydration starts and the warn handler has to be in place before the first warning.
 */
/**
 * What the plugin provides. It is spelled out because Nuxt derives the type of `$hydrationDoctor`
 * from this plugin's own type: annotated loosely, that type collapses to `{}` and nobody could call
 * `useNuxtApp().$hydrationDoctor.issues()` without a cast.
 */
type Injections = Record<'hydrationDoctor', HydrationDoctorApi>;

const hydrationDoctorPlugin: ReturnType<typeof defineNuxtPlugin<Injections>> =
  defineNuxtPlugin<Injections>({
    name: 'nuxt-hydration-doctor:client',
    enforce: 'pre',
    setup(nuxtApp) {
      try {
        const config = useRuntimeConfig();
        const options = parseRuntimeOptions(config.public[RUNTIME_CONFIG_KEY]);
        if (options === null) return undefined;

        const reportInternal = (message: string, error: unknown): void => {
          console.warn(INTERNAL_LOG_PREFIX, message, error);
        };
        const app = config.app as Record<string, unknown> | undefined;
        const rootId = app?.['rootId'];
        const teleportId = app?.['teleportId'];

        const interceptor = createInterceptor({
          document,
          attribute: options.attribute,
          historyLimit: options.historyLimit,
          // The application root and the container <Teleport> content is rendered into.
          snapshot: captureServerSnapshot(
            document,
            [idSelector(rootId, '#__nuxt'), idSelector(teleportId, '#teleports')],
            MAX_SNAPSHOT_CHARS,
          ),
          getRoute: () => location.pathname + location.search,
          now: () => Date.now(),
          sinceNavigationStart: () => performance.now(),
          schedule: (task) => {
            queueMicrotask(task);
          },
          reportInternal,
        });

        // The state the server serialised, remembered now so later changes can be spotted.
        const stateWatcher = createStateWatcher(() => entriesFromPayload(nuxtApp.payload));
        stateWatcher.capture();

        installWarnHandler(
          nuxtApp.vueApp,
          (message, instance, trace) => {
            interceptor.handleWarning(message, instance, trace);
          },
          (error) => {
            reportInternal('warn handler failed', error);
          },
          (text) => {
            console.warn(text);
          },
        );

        nuxtApp.hook('vue:error', (error, instance, info) => {
          try {
            interceptor.handleError(error, instance, info);
          } catch (failure) {
            reportInternal('vue:error handler failed', failure);
          }
        });
        nuxtApp.hook('app:mounted', () => {
          interceptor.markMounted();
        });

        // Diagnosed once per issue: the HUD and the DevTools report both use the result. A failing
        // heuristic must not hide the issue itself, so a failure means "no diagnosis".
        const diagnosed = new Map<string, HudEntry['diagnostics']>();
        const diagnose = (issue: HydrationIssue): HudEntry['diagnostics'] => {
          const known = diagnosed.get(issue.id);
          if (known !== undefined) return known;
          let diagnostics: HudEntry['diagnostics'] = [];
          try {
            diagnostics = diagnoseIssue(issue, {
              browserValues: collectBrowserValues(window),
              stateChanges: stateWatcher.changes(),
              disabledCategories: options.disabledCategories,
            });
          } catch (error) {
            reportInternal('could not diagnose an issue', error);
          }
          diagnosed.set(issue.id, diagnostics);
          // Bounded like the history it serves, so a page that mismatches in a loop cannot grow it.
          if (diagnosed.size > options.historyLimit * 4) {
            const oldest = diagnosed.keys().next();
            if (oldest.done !== true) diagnosed.delete(oldest.value);
          }
          return diagnostics;
        };

        if (options.devtools) {
          const report = createReporter({
            endpoint: DEVTOOLS_ISSUES_PATH,
            // Issue ids restart at every page load; this tells the loads apart in the DevTools tab.
            pageLoadId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            send: (url, request) => fetch(url, request),
            onFailure: (error) => {
              if (options.debug) reportInternal('could not report to the DevTools tab', error);
            },
          });
          interceptor.api.subscribe((issue) => {
            report({ issue, diagnostics: diagnose(issue) });
          });
        }

        if (options.hud.enabled) {
          const hud = options.hud;
          const buildEntry = (issue: HydrationIssue): HudEntry => ({
            issue,
            diff:
              issue.serverHtml !== null && issue.clientHtml !== null
                ? diffHtml(issue.serverHtml, issue.clientHtml, {
                    hideAttributes: [options.attribute],
                  })
                : null,
            diagnostics: diagnose(issue),
          });
          // Mounted after the application so the HUD is never part of the hydrated tree.
          nuxtApp.hook('app:mounted', () => {
            try {
              mountHud({
                document,
                view: window,
                component: HydrationDoctorHUD,
                api: interceptor.api,
                attribute: options.attribute,
                autoOpen: hud.autoOpen,
                toEntry: buildEntry,
                copyText: copyToClipboard,
                corner: hud.position,
                positionStorage,
                // Goes through the dev endpoint, so it is only offered when that endpoint exists.
                ...(options.devtools ? { openInEditor } : {}),
                observeResize,
                reportInternal,
              });
            } catch (error) {
              reportInternal('could not mount the HUD', error);
            }
          });
        }
        setTimeout(() => {
          interceptor.flush();
        }, SAFETY_FLUSH_MS);

        if (options.debug) console.info(INTERNAL_LOG_PREFIX, 'interceptor installed');
        return { provide: { hydrationDoctor: interceptor.api } };
      } catch (error) {
        console.warn(INTERNAL_LOG_PREFIX, 'failed to initialise', error);
        return undefined;
      }
    },
  });

export default hydrationDoctorPlugin;
