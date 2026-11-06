import { addDevServerHandler } from '@nuxt/kit';
import { addCustomTab } from '@nuxt/devtools-kit';
import { createDevtoolsHandler } from './handler';
import { LOOPBACK_ONLY, type AllowedHosts } from './host';
import { DEVTOOLS_BASE } from './page';
import { createReportRegistry, type ReportRegistry } from './registry';

/** How many reports the dev server keeps; older ones are dropped first. */
const MAX_STORED_REPORTS = 200;

export const TAB_NAME = 'nuxt-hydration-doctor';

export interface DevtoolsOptions {
  /** Project root: reported paths are relative to it. */
  readonly rootDir: string;
  /** Directories of the project's Nuxt layers, which "Open in Editor" may also point into. */
  readonly layerDirs?: readonly string[];
  /** Host names the endpoint answers to besides loopback names and IP addresses. */
  readonly allowedHosts?: AllowedHosts;
}

export interface DevtoolsRegistration {
  readonly registry: ReportRegistry;
}

/**
 * Adds the Hydration Doctor tab to Nuxt DevTools and the dev-only endpoint behind it.
 *
 * Only ever called by `module.ts` below the activation guard, so neither the tab nor the endpoint
 * exists in a production build. The endpoint runs in the Nuxt dev process (not in Nitro's worker),
 * so the history survives server reloads. "Open in Editor" is limited to the project and its
 * layers, and the endpoint only answers to the hosts in `allowedHosts` (see `host.ts`).
 */
export function registerDevtools(options: DevtoolsOptions): DevtoolsRegistration {
  const registry = createReportRegistry(
    MAX_STORED_REPORTS,
    () => Date.now(),
    // Different for every dev-server start, so an open tab can tell the history was reset.
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  addDevServerHandler({
    route: DEVTOOLS_BASE,
    handler: createDevtoolsHandler({
      registry,
      rootDir: options.rootDir,
      allowedRoots: options.layerDirs ?? [],
      allowedHosts: options.allowedHosts ?? LOOPBACK_ONLY,
    }),
  });
  addCustomTab({
    name: TAB_NAME,
    title: 'Hydration Doctor',
    icon: 'carbon:health-cross',
    view: { type: 'iframe', src: `${DEVTOOLS_BASE}/` },
  });
  return { registry };
}
