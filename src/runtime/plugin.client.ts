import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { INTERNAL_LOG_PREFIX, RUNTIME_CONFIG_KEY } from './domain/constants';
import { parseRuntimeOptions } from './domain/options';

/**
 * Composition root of the browser runtime.
 *
 * Registered by the module in development only (see `src/module.ts`), so production bundles
 * never contain it. It must never break the host application: all work is wrapped so a failure
 * inside the doctor degrades to a prefixed console message.
 */
const hydrationDoctorPlugin: ReturnType<typeof defineNuxtPlugin> = defineNuxtPlugin({
  name: 'nuxt-hydration-doctor:client',
  setup() {
    try {
      const options = parseRuntimeOptions(useRuntimeConfig().public[RUNTIME_CONFIG_KEY]);
      if (options === null) return;
      if (options.debug) console.info(INTERNAL_LOG_PREFIX, 'runtime plugin ready');
      // Phase 3 installs the warning interceptor here; Phase 4 mounts the HUD.
    } catch (error) {
      console.warn(INTERNAL_LOG_PREFIX, 'failed to initialise', error);
    }
  },
});

export default hydrationDoctorPlugin;
