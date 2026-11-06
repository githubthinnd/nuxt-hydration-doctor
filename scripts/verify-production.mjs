/**
 * Zero-production-footprint gate.
 *
 * Runs a real `nuxt build` of the playground (which loads the module from src/) and scans every
 * emitted file for anything that identifies the module. The playground has template elements and
 * enables the module, so a leak would show up here.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'playground/.output');

// Strings that must not appear in a production build. The attribute and the plugin names are the
// module's observable traces; the log prefix and the runtime config key cover the runtime.
// "nuxt-hydration-doctor:" (with the colon) is the prefix of the plugin names; the bare package
// name is deliberately not scanned because Nitro derives its output package name from the project
// name and the playground's own text mentions it.
const FORBIDDEN = ['data-nhd-loc', 'nuxt-hydration-doctor:', 'HydrationDoctor', 'hydrationDoctor'];
// A string that must appear, proving the scan actually read the bundle.
const CONTROL = 'nuxt';

rmSync(output, { recursive: true, force: true });
execFileSync('npx', ['nuxt', 'build', 'playground'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NUXT_TELEMETRY_DISABLED: '1' },
});

function* files(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const hits = [];
let scanned = 0;
let controlSeen = false;
for (const path of files(output)) {
  if (!/\.(m?js|cjs|html|json|css|map|txt)$/.test(path)) continue;
  scanned += 1;
  const text = readFileSync(path, 'utf8');
  if (text.includes(CONTROL)) controlSeen = true;
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) hits.push(`${relative(root, path)}: ${needle}`);
  }
}

if (!controlSeen || scanned === 0) {
  console.error(`Scan did not read the bundle (files scanned: ${String(scanned)}).`);
  process.exit(1);
}
if (hits.length > 0) {
  console.error(`Production output contains traces of the module:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`Production build is clean: ${String(scanned)} files scanned, no trace of the module.`);
