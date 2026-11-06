/**
 * Checks that `$hydrationDoctor` really has a usable type in a Nuxt project, in both modes.
 *
 * It generates the playground's types the way Nuxt does (development and production), writes a
 * small file that uses `useNuxtApp().$hydrationDoctor`, and runs `vue-tsc` on it:
 *
 * - while developing the module is active and Nuxt infers the property from the plugin, so it
 *   must be non-optional and fully typed;
 * - otherwise (`nuxt prepare`, a production build) only the fallback declaration exists, and the
 *   property must be optional.
 *
 * A file that merely exists in `.nuxt/types` proves nothing: an earlier version generated one
 * and the property still resolved to `{}`.
 */
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadNuxt, writeTypes } from '@nuxt/kit';

const root = resolve(import.meta.dirname, '..');
const playground = join(root, 'playground');
const probe = join(playground, 'zz-type-check.ts');

const PROBES = {
  development: `
const api = useNuxtApp().$hydrationDoctor;
export const count: number = api.issues().length;
// @ts-expect-error issues() returns a list, not a string
export const wrong: string = api.issues();
`,
  production: `
const api = useNuxtApp().$hydrationDoctor;
export const count: number | undefined = api?.issues().length;
// @ts-expect-error optional: it does not exist outside development
export const unguarded: number = api.issues().length;
`,
};

let failed = false;
for (const [mode, source] of Object.entries(PROBES)) {
  const nuxt = await loadNuxt({
    cwd: playground,
    dev: mode === 'development',
    ready: true,
    overrides: { _prepare: true, logLevel: 'silent' },
  });
  await writeTypes(nuxt);
  await nuxt.close();

  writeFileSync(probe, source.trimStart());
  let output = '';
  try {
    execFileSync('npx', ['vue-tsc', '--noEmit', '-p', join(playground, '.nuxt/tsconfig.json')], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    // vue-tsc exits non-zero when it finds any error; what matters is whether one is in the probe.
    output = String(error.stdout ?? error);
  } finally {
    rmSync(probe, { force: true });
  }
  const own = output.split('\n').filter((line) => line.includes('zz-type-check'));
  if (own.length > 0) {
    failed = true;
    console.error(`$hydrationDoctor is mistyped in ${mode} mode:\n${own.join('\n')}`);
  } else {
    console.log(`$hydrationDoctor is typed correctly in ${mode} mode.`);
  }
}

// Leave the generated types in the state a plain `nuxt prepare` gives.
const nuxt = await loadNuxt({
  cwd: playground,
  dev: false,
  ready: true,
  overrides: { _prepare: true, logLevel: 'silent' },
});
await writeTypes(nuxt);
await nuxt.close();

process.exit(failed ? 1 : 0);
