/** Package name; also the Nuxt module name and the logger tag. */
export const MODULE_NAME = 'nuxt-hydration-doctor';

/** Key under which users configure the module in `nuxt.config.ts`. */
export const CONFIG_KEY = 'hydrationDoctor';

/** Key under `runtimeConfig.public` that carries the browser-safe options (dev only). */
export const RUNTIME_CONFIG_KEY = 'hydrationDoctor';

/** Prefix of every message the module logs about its own failures. */
export const INTERNAL_LOG_PREFIX = '[HydrationDoctor:Internal]';

/** Where the dev server mounts the DevTools endpoint and page (dev only). */
export const DEVTOOLS_BASE_PATH = '/__nhd';

/** Marker header the dev endpoint requires on writes and on opening an editor. */
export const DEVTOOLS_CLIENT_HEADER = 'x-nhd-client';

/** Endpoint the browser reports captured issues to. */
export const DEVTOOLS_ISSUES_PATH = '/__nhd/issues';

/** Attribute injected into template tags to map DOM nodes back to SFC source positions. */
export const DEFAULT_LOCATION_ATTRIBUTE = 'data-nhd-loc';
