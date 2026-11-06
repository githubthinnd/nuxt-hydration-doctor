import { resolve } from 'node:path';
import { loadNuxt } from '@nuxt/kit';
import { describe, expect, it } from 'vitest';
import { TAB_NAME } from '../../src/devtools';
import { AST_INJECTOR_NAME } from '../../src/plugins/ast-injector';
import { DEVTOOLS_BASE_PATH } from '../../src/runtime/domain/constants';

const playground = resolve(import.meta.dirname, '../../playground');
const PLUGIN_SUFFIX = 'src/runtime/plugin.client.ts';

interface Observed {
  readonly pluginSources: readonly string[];
  readonly publicConfig: unknown;
  readonly vitePluginNames: readonly string[];
  readonly devHandlerRoutes: readonly string[];
  readonly tabs: readonly { name: string; view: unknown }[];
}

interface Scenario {
  readonly dev: boolean;
  readonly hydrationDoctor?: Record<string, unknown>;
  /** Overrides for Nuxt's own `devtools` option. */
  readonly devtools?: boolean | { enabled: boolean };
}

/** Loads the playground with Nuxt in the given mode and records what the module registered. */
async function observe({ dev, hydrationDoctor, devtools }: Scenario): Promise<Observed> {
  const nuxt = await loadNuxt({
    cwd: playground,
    dev,
    ready: true,
    overrides: {
      _prepare: true,
      logLevel: 'silent',
      ...(hydrationDoctor === undefined ? {} : { hydrationDoctor }),
      ...(devtools === undefined ? {} : { devtools }),
    },
  });
  try {
    const config: { plugins: { name?: string }[] } = { plugins: [] };
    await nuxt.callHook('vite:extend', { nuxt, config } as never);
    // This is how Nuxt DevTools collects the tabs modules registered.
    const tabs: { name: string; view: unknown }[] = [];
    // The hook belongs to Nuxt DevTools' own typings, which this repo does not load.
    const untyped = nuxt as unknown as {
      callHook(name: string, ...args: unknown[]): Promise<void>;
    };
    await untyped.callHook('devtools:customTabs', tabs);
    return {
      pluginSources: nuxt.options.plugins.map((p) => (typeof p === 'string' ? p : p.src)),
      publicConfig: nuxt.options.runtimeConfig.public['hydrationDoctor'],
      vitePluginNames: config.plugins.map((p) => p.name ?? ''),
      devHandlerRoutes: nuxt.options.devServerHandlers.flatMap((h) => h.route ?? []),
      tabs,
    };
  } finally {
    await nuxt.close();
  }
}

const hasPlugin = (seen: Observed): boolean =>
  seen.pluginSources.some((s) => s.endsWith(PLUGIN_SUFFIX));
const hasTab = (seen: Observed): boolean => seen.tabs.some((tab) => tab.name === TAB_NAME);

describe('module activation (real Nuxt)', () => {
  it('registers the runtime plugin, config, Vite transform, DevTools tab and endpoint in development', async () => {
    const seen = await observe({ dev: true });
    expect(hasPlugin(seen)).toBe(true);
    expect(seen.publicConfig).toMatchObject({ attribute: 'data-nhd-loc', devtools: true });
    expect(seen.vitePluginNames).toContain(AST_INJECTOR_NAME);
    expect(seen.devHandlerRoutes).toContain(DEVTOOLS_BASE_PATH);
    expect(hasTab(seen)).toBe(true);
    expect(seen.tabs.find((tab) => tab.name === TAB_NAME)?.view).toEqual({
      type: 'iframe',
      src: `${DEVTOOLS_BASE_PATH}/`,
    });
  }, 60_000);

  it('registers nothing in a production build', async () => {
    const seen = await observe({ dev: false });
    expect(hasPlugin(seen)).toBe(false);
    expect(seen.publicConfig).toBeUndefined();
    expect(seen.vitePluginNames).not.toContain(AST_INJECTOR_NAME);
    expect(seen.devHandlerRoutes).not.toContain(DEVTOOLS_BASE_PATH);
    expect(hasTab(seen)).toBe(false);
  }, 60_000);

  it('registers nothing in development when disabled', async () => {
    const seen = await observe({ dev: true, hydrationDoctor: { enabled: false } });
    expect(hasPlugin(seen)).toBe(false);
    expect(seen.publicConfig).toBeUndefined();
    expect(seen.vitePluginNames).not.toContain(AST_INJECTOR_NAME);
    expect(seen.devHandlerRoutes).not.toContain(DEVTOOLS_BASE_PATH);
    expect(hasTab(seen)).toBe(false);
  }, 60_000);

  it('keeps the HUD but skips the DevTools tab and endpoint when our devtools option is off', async () => {
    const seen = await observe({ dev: true, hydrationDoctor: { devtools: { enabled: false } } });
    expect(hasPlugin(seen)).toBe(true);
    expect(seen.publicConfig).toMatchObject({ devtools: false });
    expect(seen.devHandlerRoutes).not.toContain(DEVTOOLS_BASE_PATH);
    expect(hasTab(seen)).toBe(false);
  }, 60_000);

  it('skips the DevTools tab and endpoint when Nuxt DevTools itself is off', async () => {
    const seen = await observe({ dev: true, devtools: { enabled: false } });
    expect(hasPlugin(seen)).toBe(true);
    expect(seen.publicConfig).toMatchObject({ devtools: false });
    expect(seen.devHandlerRoutes).not.toContain(DEVTOOLS_BASE_PATH);
    expect(hasTab(seen)).toBe(false);
  }, 60_000);
});
