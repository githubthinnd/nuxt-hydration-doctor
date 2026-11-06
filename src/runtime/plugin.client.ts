import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { INTERNAL_LOG_PREFIX, RUNTIME_CONFIG_KEY } from './domain/constants';
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
import type { HudEntry } from './domain/hud';
import type { HydrationIssue } from './domain/issue';

/** Server markup larger than this is not copied: the snapshot is a dev convenience, not a must. */
const MAX_SNAPSHOT_CHARS = 2_000_000;
/** Completes pending captures even if `app:mounted` never fires (a crashed hydration, say). */
const SAFETY_FLUSH_MS = 5000;

function copyToClipboard(text: string): void {
  if ('clipboard' in navigator) navigator.clipboard.writeText(text).catch(() => undefined);
}

function observeResize(element: Element, callback: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  const observer = new ResizeObserver(callback);
  observer.observe(element);
  return () => {
    observer.disconnect();
  };
}

function rootSelector(rootId: unknown): string {
  return typeof rootId === 'string' && /^[\w-]+$/.test(rootId) ? `#${rootId}` : '#__nuxt';
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
const hydrationDoctorPlugin: ReturnType<typeof defineNuxtPlugin> = defineNuxtPlugin({
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
      const rootId = (config.app as Record<string, unknown> | undefined)?.['rootId'];

      const interceptor = createInterceptor({
        document,
        attribute: options.attribute,
        historyLimit: options.historyLimit,
        snapshot: captureServerSnapshot(document, rootSelector(rootId), MAX_SNAPSHOT_CHARS),
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

      if (options.hud.enabled) {
        const hud = options.hud;
        const buildEntry = (issue: HydrationIssue): HudEntry => {
          const diff =
            issue.serverHtml !== null && issue.clientHtml !== null
              ? diffHtml(issue.serverHtml, issue.clientHtml, {
                  hideAttributes: [options.attribute],
                })
              : null;
          // A failing heuristic must not hide the issue itself: show it without a diagnosis.
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
          return { issue, diff, diagnostics };
        };
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
