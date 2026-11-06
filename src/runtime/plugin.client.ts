import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { INTERNAL_LOG_PREFIX, RUNTIME_CONFIG_KEY } from './domain/constants';
import { parseRuntimeOptions } from './domain/options';
import { createInterceptor } from './interceptor/interceptor';
import { installWarnHandler } from './interceptor/install';
import { captureServerSnapshot } from './interceptor/snapshot';

/** Server markup larger than this is not copied: the snapshot is a dev convenience, not a must. */
const MAX_SNAPSHOT_CHARS = 2_000_000;
/** Completes pending captures even if `app:mounted` never fires (a crashed hydration, say). */
const SAFETY_FLUSH_MS = 5000;

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
