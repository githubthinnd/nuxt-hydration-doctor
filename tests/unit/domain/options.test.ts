import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  parseRuntimeOptions,
  resolveModuleOptions,
  shouldActivate,
  toRuntimeOptions,
  type ModuleOptions,
} from '../../../src/runtime/domain/options';
import { HydrationDoctorError } from '../../../src/runtime/domain/errors';

function configurationError(input: unknown): HydrationDoctorError {
  try {
    resolveModuleOptions(input as ModuleOptions);
  } catch (error) {
    if (error instanceof HydrationDoctorError) return error;
    throw error;
  }
  throw new Error('expected resolveModuleOptions to throw');
}

describe('resolveModuleOptions', () => {
  it('returns the defaults for empty input', () => {
    expect(resolveModuleOptions()).toEqual(DEFAULT_OPTIONS);
    expect(resolveModuleOptions({})).toEqual(DEFAULT_OPTIONS);
  });

  it('merges partial nested groups with the defaults', () => {
    const resolved = resolveModuleOptions({
      debug: true,
      hud: { autoOpen: false },
      history: { limit: 10 },
    });
    expect(resolved.debug).toBe(true);
    expect(resolved.hud).toEqual({ enabled: true, autoOpen: false, position: 'bottom-right' });
    expect(resolved.history.limit).toBe(10);
    expect(resolved.sourceMap).toEqual(DEFAULT_OPTIONS.sourceMap);
  });

  it('is idempotent, so Nuxt-merged defaults can be resolved again', () => {
    const once = resolveModuleOptions({ sourceMap: { attribute: 'data-where' } });
    expect(resolveModuleOptions(once)).toEqual(once);
  });

  it.each([
    ['unknown top-level key', { hud: {}, nope: 1 }, 'hydrationDoctor.nope'],
    ['unknown nested key', { hud: { colour: 'red' } }, 'hud.colour'],
    ['non-object group', { hud: true }, 'hud'],
    ['an unknown corner', { hud: { position: 'middle' } }, 'hud.position'],
    ['a non-string corner', { hud: { position: 3 } }, 'hud.position'],
    ['a wrongly cased corner', { hud: { position: 'Top-Left' } }, 'hud.position'],
    ['non-boolean flag', { enabled: 'yes' }, 'hydrationDoctor.enabled'],
    ['bad attribute name', { sourceMap: { attribute: 'loc' } }, 'sourceMap.attribute'],
    ['uppercase attribute name', { sourceMap: { attribute: 'data-Loc' } }, 'sourceMap.attribute'],
    ['non-array exclude', { sourceMap: { exclude: '/a/' } }, 'sourceMap.exclude'],
    ['empty exclude entry', { sourceMap: { exclude: [''] } }, 'sourceMap.exclude'],
    ['zero history limit', { history: { limit: 0 } }, 'history.limit'],
    ['fractional history limit', { history: { limit: 1.5 } }, 'history.limit'],
    ['huge history limit', { history: { limit: 10_000 } }, 'history.limit'],
    [
      'unknown diagnostic category',
      { diagnostics: { disabledCategories: ['magic'] } },
      'diagnostics.disabledCategories',
    ],
  ])('rejects %s', (_label, input, optionPath) => {
    const error = configurationError(input);
    expect(error.code).toBe('INVALID_CONFIGURATION');
    expect(error.details).toEqual({ option: optionPath });
  });

  it('accepts known diagnostic categories', () => {
    const resolved = resolveModuleOptions({
      diagnostics: { disabledCategories: ['invalid-html-nesting'] },
    });
    expect(resolved.diagnostics.disabledCategories).toEqual(['invalid-html-nesting']);
  });
});

describe('shouldActivate', () => {
  const enabled = resolveModuleOptions({ enabled: true });
  const disabled = resolveModuleOptions({ enabled: false });

  it('activates only in development when enabled', () => {
    expect(shouldActivate(enabled, true)).toBe(true);
  });

  it('never activates in production, whatever the options say', () => {
    expect(shouldActivate(enabled, false)).toBe(false);
    expect(shouldActivate(disabled, false)).toBe(false);
  });

  it('respects the master switch in development', () => {
    expect(shouldActivate(disabled, true)).toBe(false);
  });
});

describe('runtime options', () => {
  it('round-trips through JSON, as runtimeConfig does', () => {
    const runtime = toRuntimeOptions(resolveModuleOptions({ debug: true }));
    const transported: unknown = JSON.parse(JSON.stringify(runtime));
    expect(parseRuntimeOptions(transported)).toEqual(runtime);
  });

  it.each([
    ['undefined', undefined],
    ['a string', 'hydrationDoctor'],
    ['an array', []],
    ['an empty object', {}],
    ['a wrong attribute', { ...toRuntimeOptions(DEFAULT_OPTIONS), attribute: 'onclick' }],
    ['a zero limit', { ...toRuntimeOptions(DEFAULT_OPTIONS), historyLimit: 0 }],
    ['a malformed hud', { ...toRuntimeOptions(DEFAULT_OPTIONS), hud: { enabled: 1 } }],
    [
      'a hud without a valid corner',
      {
        ...toRuntimeOptions(DEFAULT_OPTIONS),
        hud: { enabled: true, autoOpen: true, position: 'centre' },
      },
    ],
  ])('returns null instead of throwing for %s', (_label, value) => {
    expect(parseRuntimeOptions(value)).toBeNull();
  });

  it('drops unknown categories instead of trusting them', () => {
    const parsed = parseRuntimeOptions({
      ...toRuntimeOptions(DEFAULT_OPTIONS),
      disabledCategories: ['invalid-html-nesting', 'rm -rf'],
    });
    expect(parsed?.disabledCategories).toEqual(['invalid-html-nesting']);
  });

  it.each(['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const)(
    'accepts the corner %s and carries it to the browser',
    (position) => {
      const resolved = resolveModuleOptions({ hud: { position } });
      expect(resolved.hud.position).toBe(position);
      const transported: unknown = JSON.parse(JSON.stringify(toRuntimeOptions(resolved)));
      expect(parseRuntimeOptions(transported)?.hud.position).toBe(position);
    },
  );
});
