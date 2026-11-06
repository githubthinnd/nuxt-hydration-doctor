import { resolve } from 'node:path';
import { loadNuxt } from '@nuxt/kit';
import { describe, expect, it } from 'vitest';
import { AST_INJECTOR_NAME } from '../../src/plugins/ast-injector';

const playground = resolve(import.meta.dirname, '../../playground');
const PLUGIN_SUFFIX = 'src/runtime/plugin.client.ts';

interface Observed {
  readonly pluginSources: readonly string[];
  readonly publicConfig: unknown;
  readonly vitePluginNames: readonly string[];
}

/** Loads the playground with Nuxt in the given mode and records what the module registered. */
async function observe(dev: boolean, hydrationDoctor?: Record<string, unknown>): Promise<Observed> {
  const nuxt = await loadNuxt({
    cwd: playground,
    dev,
    ready: true,
    overrides: {
      _prepare: true,
      logLevel: 'silent',
      ...(hydrationDoctor === undefined ? {} : { hydrationDoctor }),
    },
  });
  try {
    const config: { plugins: { name?: string }[] } = { plugins: [] };
    await nuxt.callHook('vite:extend', { nuxt, config } as never);
    return {
      pluginSources: nuxt.options.plugins.map((p) => (typeof p === 'string' ? p : p.src)),
      publicConfig: nuxt.options.runtimeConfig.public['hydrationDoctor'],
      vitePluginNames: config.plugins.map((p) => p.name ?? ''),
    };
  } finally {
    await nuxt.close();
  }
}

describe('module activation (real Nuxt)', () => {
  it('registers the runtime plugin, config and Vite transform in development', async () => {
    const seen = await observe(true);
    expect(seen.pluginSources.some((s) => s.endsWith(PLUGIN_SUFFIX))).toBe(true);
    expect(seen.publicConfig).toMatchObject({ attribute: 'data-nhd-loc' });
    expect(seen.vitePluginNames).toContain(AST_INJECTOR_NAME);
  }, 60_000);

  it('registers nothing in a production build', async () => {
    const seen = await observe(false);
    expect(seen.pluginSources.some((s) => s.endsWith(PLUGIN_SUFFIX))).toBe(false);
    expect(seen.publicConfig).toBeUndefined();
    expect(seen.vitePluginNames).not.toContain(AST_INJECTOR_NAME);
  }, 60_000);

  it('registers nothing in development when disabled', async () => {
    const seen = await observe(true, { enabled: false });
    expect(seen.pluginSources.some((s) => s.endsWith(PLUGIN_SUFFIX))).toBe(false);
    expect(seen.publicConfig).toBeUndefined();
    expect(seen.vitePluginNames).not.toContain(AST_INJECTOR_NAME);
  }, 60_000);
});
