/** Package name; also the Nuxt module name and the logger tag. */
export const MODULE_NAME = 'nuxt-hydration-doctor';

/** Key under which users configure the module in `nuxt.config.ts`. */
export const CONFIG_KEY = 'hydrationDoctor';

/** Key under `runtimeConfig.public` that carries the browser-safe options (dev only). */
export const RUNTIME_CONFIG_KEY = 'hydrationDoctor';

/** Prefix of every message the module logs about its own failures. */
export const INTERNAL_LOG_PREFIX = '[HydrationDoctor:Internal]';

/** Attribute injected into template tags to map DOM nodes back to SFC source positions. */
export const DEFAULT_LOCATION_ATTRIBUTE = 'data-nhd-loc';
