/**
 * Guards the public type surface of the built package.
 *
 * @nuxt/module-builder derives dist/types.d.mts from the exports of src/module.ts and silently
 * drops anything that is not re-exported there, so this fails the build if a documented public
 * type goes missing (or an internal one leaks).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PUBLIC_TYPES = [
  'ModuleOptions',
  'HydrationDoctorApi',
  'HydrationIssue',
  'HydrationMetrics',
  'HydrationMismatchKind',
  'SourceLocation',
  'DiagnosticResult',
  'DiagnosticCategory',
  'FixSuggestion',
];
const INTERNAL_NAMES = ['ResolvedModuleOptions', 'RuntimeOptions', 'HydrationDoctorError'];

const dtsPath = resolve(import.meta.dirname, '../dist/types.d.mts');
const dts = readFileSync(dtsPath, 'utf8');
const exportedNames = new Set(
  [...dts.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)].flatMap((match) =>
    (match[1] ?? '')
      .split(',')
      .map((part) =>
        part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)
          .pop(),
      )
      .filter(Boolean),
  ),
);

const missing = PUBLIC_TYPES.filter((name) => !exportedNames.has(name));
const leaked = INTERNAL_NAMES.filter((name) => exportedNames.has(name));

if (missing.length > 0 || leaked.length > 0) {
  console.error(`dist/types.d.mts is wrong. missing: [${missing}] leaked: [${leaked}]`);
  process.exit(1);
}
console.log(`dist/types.d.mts exports all ${String(PUBLIC_TYPES.length)} public types.`);
