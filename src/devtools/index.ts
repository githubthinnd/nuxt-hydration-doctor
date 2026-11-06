import { addDevServerHandler } from '@nuxt/kit';
import { addCustomTab } from '@nuxt/devtools-kit';
import { createDevtoolsHandler } from './handler';
import { DEVTOOLS_BASE } from './page';
import { createReportRegistry, type ReportRegistry } from './registry';

/** How many reports the dev server keeps; older ones are dropped first. */
const MAX_STORED_REPORTS = 200;

export const TAB_NAME = 'nuxt-hydration-doctor';

export interface DevtoolsRegistration {
  readonly registry: ReportRegistry;
}

/**
 * Adds the Hydration Doctor tab to Nuxt DevTools and the dev-only endpoint behind it.
 *
 * Only ever called by `module.ts` below the activation guard, so neither the tab nor the endpoint
 * exists in a production build. The endpoint runs in the Nuxt dev process (not in Nitro's worker),
 * so the history survives server reloads. `rootDir` limits "Open in Editor" to the project.
 */
export function registerDevtools(rootDir: string): DevtoolsRegistration {
  const registry = createReportRegistry(MAX_STORED_REPORTS, () => Date.now());
  addDevServerHandler({
    route: DEVTOOLS_BASE,
    handler: createDevtoolsHandler({ registry, rootDir }),
  });
  addCustomTab({
    name: TAB_NAME,
    title: 'Hydration Doctor',
    icon: 'carbon:health-cross',
    view: { type: 'iframe', src: `${DEVTOOLS_BASE}/` },
  });
  return { registry };
}
