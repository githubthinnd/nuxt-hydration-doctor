import { DEFAULT_LOCATION_ATTRIBUTE } from './constants';
import { DIAGNOSTIC_CATEGORIES, type DiagnosticCategory } from './diagnostic';
import { HydrationDoctorError } from './errors';

/**
 * User-facing configuration (`hydrationDoctor` in `nuxt.config.ts`).
 * Every field is optional; see {@link DEFAULT_OPTIONS} for the values used when omitted.
 */
export interface ModuleOptions {
  /** Master switch. Even when true the module does nothing outside `nuxt dev`. */
  enabled?: boolean;
  /** Log the module's own activity to the terminal and the browser console. */
  debug?: boolean;
  /** Source-location injection into Vue templates (Phase 2). */
  sourceMap?: {
    /** Attribute name written into template tags. Must look like `data-*`. */
    attribute?: string;
    /** Path fragments of SFCs that must not be instrumented. */
    exclude?: readonly string[];
  };
  /** Heads-Up Display overlay (Phase 4). */
  hud?: {
    enabled?: boolean;
    /** Open the HUD as soon as the first mismatch is captured. */
    autoOpen?: boolean;
  };
  /** Nuxt DevTools tab (Phase 6). */
  devtools?: { enabled?: boolean };
  /** Session history of captured mismatches. */
  history?: {
    /** Maximum number of issues kept; the oldest are dropped first. */
    limit?: number;
  };
  /** Heuristic engine (Phase 5). */
  diagnostics?: {
    /** Heuristic families to skip. */
    disabledCategories?: readonly DiagnosticCategory[];
  };
}

/** {@link ModuleOptions} after defaults and validation: nothing is optional any more. */
export interface ResolvedModuleOptions {
  readonly enabled: boolean;
  readonly debug: boolean;
  readonly sourceMap: {
    readonly attribute: string;
    readonly exclude: readonly string[];
  };
  readonly hud: {
    readonly enabled: boolean;
    readonly autoOpen: boolean;
  };
  readonly devtools: { readonly enabled: boolean };
  readonly history: { readonly limit: number };
  readonly diagnostics: { readonly disabledCategories: readonly DiagnosticCategory[] };
}

/** The browser-safe subset of the options, serialised into `runtimeConfig.public` in dev. */
export interface RuntimeOptions {
  readonly debug: boolean;
  readonly attribute: string;
  readonly hud: {
    readonly enabled: boolean;
    readonly autoOpen: boolean;
  };
  readonly historyLimit: number;
  readonly disabledCategories: readonly DiagnosticCategory[];
}

export const DEFAULT_OPTIONS: ResolvedModuleOptions = {
  enabled: true,
  debug: false,
  sourceMap: { attribute: DEFAULT_LOCATION_ATTRIBUTE, exclude: ['/node_modules/'] },
  hud: { enabled: true, autoOpen: true },
  devtools: { enabled: true },
  history: { limit: 50 },
  diagnostics: { disabledCategories: [] },
};

const ATTRIBUTE_PATTERN = /^data-[a-z][a-z0-9-]*$/;
const HISTORY_LIMIT_RANGE = { min: 1, max: 1000 } as const;

type UnknownRecord = Readonly<Record<string, unknown>>;

function reject(path: string, message: string): never {
  throw new HydrationDoctorError('INVALID_CONFIGURATION', message, { details: { option: path } });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the group at `path` as a record, rejecting non-objects and unknown keys. */
function readGroup(value: unknown, path: string, allowedKeys: readonly string[]): UnknownRecord {
  if (value === undefined) return {};
  if (!isRecord(value)) reject(path, `Option "${path}" must be an object.`);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) reject(`${path}.${key}`, `Unknown option "${path}.${key}".`);
  }
  return value;
}

function readBoolean(group: UnknownRecord, key: string, path: string, fallback: boolean): boolean {
  const value = group[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean')
    reject(`${path}.${key}`, `Option "${path}.${key}" must be a boolean.`);
  return value;
}

function readStringArray(
  group: UnknownRecord,
  key: string,
  path: string,
  fallback: readonly string[],
): readonly string[] {
  const value = group[key];
  if (value === undefined) return fallback;
  const optionPath = `${path}.${key}`;
  if (!Array.isArray(value))
    reject(optionPath, `Option "${optionPath}" must be an array of strings.`);
  const items: readonly unknown[] = value;
  const strings = items.filter((item): item is string => typeof item === 'string' && item !== '');
  if (strings.length !== items.length) {
    reject(optionPath, `Option "${optionPath}" must contain only non-empty strings.`);
  }
  return strings;
}

/**
 * Applies defaults to user options and validates them.
 *
 * Nothing is silently ignored: unknown keys and wrongly typed values throw an
 * `INVALID_CONFIGURATION` error naming the offending option path. Values arrive from
 * `nuxt.config.ts`, which may be plain JavaScript, so every field is checked at runtime.
 */
export function resolveModuleOptions(input: ModuleOptions = {}): ResolvedModuleOptions {
  const root = readGroup(input, 'hydrationDoctor', [
    'enabled',
    'debug',
    'sourceMap',
    'hud',
    'devtools',
    'history',
    'diagnostics',
  ]);
  const sourceMap = readGroup(root['sourceMap'], 'sourceMap', ['attribute', 'exclude']);
  const hud = readGroup(root['hud'], 'hud', ['enabled', 'autoOpen']);
  const devtools = readGroup(root['devtools'], 'devtools', ['enabled']);
  const history = readGroup(root['history'], 'history', ['limit']);
  const diagnostics = readGroup(root['diagnostics'], 'diagnostics', ['disabledCategories']);

  const attribute = sourceMap['attribute'] ?? DEFAULT_OPTIONS.sourceMap.attribute;
  if (typeof attribute !== 'string' || !ATTRIBUTE_PATTERN.test(attribute)) {
    reject('sourceMap.attribute', 'Option "sourceMap.attribute" must look like "data-name".');
  }

  const limit = history['limit'] ?? DEFAULT_OPTIONS.history.limit;
  if (
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < HISTORY_LIMIT_RANGE.min ||
    limit > HISTORY_LIMIT_RANGE.max
  ) {
    reject(
      'history.limit',
      `Option "history.limit" must be an integer between ${String(HISTORY_LIMIT_RANGE.min)} and ${String(HISTORY_LIMIT_RANGE.max)}.`,
    );
  }

  const disabledCategories = readStringArray(
    diagnostics,
    'disabledCategories',
    'diagnostics',
    DEFAULT_OPTIONS.diagnostics.disabledCategories,
  ).map((name) => {
    const category = DIAGNOSTIC_CATEGORIES.find((known) => known === name);
    if (category === undefined) {
      reject('diagnostics.disabledCategories', `Unknown diagnostic category "${name}".`);
    }
    return category;
  });

  return {
    enabled: readBoolean(root, 'enabled', 'hydrationDoctor', DEFAULT_OPTIONS.enabled),
    debug: readBoolean(root, 'debug', 'hydrationDoctor', DEFAULT_OPTIONS.debug),
    sourceMap: {
      attribute,
      exclude: readStringArray(
        sourceMap,
        'exclude',
        'sourceMap',
        DEFAULT_OPTIONS.sourceMap.exclude,
      ),
    },
    hud: {
      enabled: readBoolean(hud, 'enabled', 'hud', DEFAULT_OPTIONS.hud.enabled),
      autoOpen: readBoolean(hud, 'autoOpen', 'hud', DEFAULT_OPTIONS.hud.autoOpen),
    },
    devtools: {
      enabled: readBoolean(devtools, 'enabled', 'devtools', DEFAULT_OPTIONS.devtools.enabled),
    },
    history: { limit },
    diagnostics: { disabledCategories },
  };
}

/**
 * The single place that decides whether the module does anything.
 * Production builds (`dev === false`) never activate, whatever the options say.
 */
export function shouldActivate(
  options: Pick<ResolvedModuleOptions, 'enabled'>,
  dev: boolean,
): boolean {
  return dev && options.enabled;
}

export function toRuntimeOptions(options: ResolvedModuleOptions): RuntimeOptions {
  return {
    debug: options.debug,
    attribute: options.sourceMap.attribute,
    hud: { enabled: options.hud.enabled, autoOpen: options.hud.autoOpen },
    historyLimit: options.history.limit,
    disabledCategories: options.diagnostics.disabledCategories,
  };
}

/**
 * Re-validates the options the browser received. The runtime must never trust (or crash on)
 * whatever is in `runtimeConfig`, so this returns null instead of throwing.
 */
export function parseRuntimeOptions(value: unknown): RuntimeOptions | null {
  if (!isRecord(value)) return null;
  const { debug, attribute, hud, historyLimit, disabledCategories } = value;
  if (typeof debug !== 'boolean') return null;
  if (typeof attribute !== 'string' || !ATTRIBUTE_PATTERN.test(attribute)) return null;
  if (
    !isRecord(hud) ||
    typeof hud['enabled'] !== 'boolean' ||
    typeof hud['autoOpen'] !== 'boolean'
  ) {
    return null;
  }
  if (typeof historyLimit !== 'number' || !Number.isInteger(historyLimit) || historyLimit < 1) {
    return null;
  }
  if (!Array.isArray(disabledCategories)) return null;
  const names: readonly unknown[] = disabledCategories;
  const categories = DIAGNOSTIC_CATEGORIES.filter((known) => names.includes(known));
  return {
    debug,
    attribute,
    hud: { enabled: hud['enabled'], autoOpen: hud['autoOpen'] },
    historyLimit,
    disabledCategories: categories,
  };
}
