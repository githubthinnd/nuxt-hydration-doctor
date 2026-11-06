import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'),
) as Record<string, unknown>;

describe('package manifest invariants', () => {
  it('has no lifecycle scripts that run on install', () => {
    const scripts = Object.keys(manifest['scripts'] as Record<string, string>);
    const forbidden = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'];
    expect(scripts.filter((s) => forbidden.includes(s))).toEqual([]);
  });

  it('is ESM-only and ships an explicit allowlist', () => {
    expect(manifest['type']).toBe('module');
    expect(manifest['files']).toEqual(['dist', 'README.md', 'CHANGELOG.md', 'LICENSE']);
  });

  it('exposes only the module entry and its types', () => {
    expect(manifest['exports']).toEqual({
      '.': { types: './dist/types.d.mts', import: './dist/module.mjs' },
    });
  });

  it('keeps build tooling out of the runtime dependency set the browser could see', () => {
    // Build-time packages are regular dependencies of the module (they run in Node), but the
    // arch rule "runtime-must-not-use-build-time-packages" keeps them out of the browser.
    const dependencies = Object.keys(manifest['dependencies'] as Record<string, string>);
    expect(dependencies).toEqual(
      expect.arrayContaining([
        '@nuxt/kit',
        '@nuxt/devtools-kit',
        '@vue/compiler-sfc',
        'magic-string',
        'unplugin',
      ]),
    );
  });

  it('targets Nuxt 3 and Nuxt 4', () => {
    expect(manifest['peerDependencies']).toEqual({ nuxt: '^3.15.0 || ^4.0.0' });
  });

  it('is publishable as a public 1.x package', () => {
    expect(manifest['private']).toBeUndefined();
    expect(manifest['version']).toMatch(/^1\.\d+\.\d+$/);
    expect(manifest['publishConfig']).toEqual({ access: 'public' });
  });

  it('runs the full check before publishing', () => {
    expect(manifest['scripts']).toMatchObject({ prepublishOnly: 'npm run check' });
  });
});
