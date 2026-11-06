/**
 * Architecture rules for nuxt-hydration-doctor.
 *
 * A Nuxt module has two worlds that must never leak into each other:
 *
 *   build-time (Node, runs inside `nuxt dev` / `nuxt build`)
 *     src/module.ts     composition root, the only entry Nuxt loads        -> plugins, devtools, runtime/domain
 *     src/plugins/      compiler transforms (Vite/unplugin, magic-string)   -> runtime/domain
 *     src/devtools.ts   Nuxt DevTools integration                          -> runtime/domain
 *
 *   runtime (browser, shipped as source by the module builder, dev only)
 *     runtime/domain       shared kernel: types, options, errors           -> (nothing)
 *     runtime/engine       pure heuristic diagnostics                      -> domain
 *     runtime/interceptor  warning capture and DOM snapshots               -> domain
 *     runtime/hud          Shadow DOM host, overlay rect tracking          -> domain
 *     runtime/components   presentational HUD component (props in, events out) -> domain
 *     runtime/plugin.client.ts  runtime composition root                   -> all runtime layers
 *
 * `runtime/domain` is the only code shared by both worlds. It lives under runtime/ because the
 * module builder ships that directory as source and files there cannot import from outside it.
 *
 * Additionally: the runtime never imports build-time packages (@nuxt/kit, unplugin, magic-string,
 * @vue/compiler-sfc, vite), compiler transforms stay Nuxt-agnostic so they are unit-testable,
 * and nothing imports tests.
 */

const NPM_AND_BUILTIN_TYPES = [
  'core',
  'npm',
  'npm-dev',
  'npm-optional',
  'npm-peer',
  'npm-bundled',
  'npm-no-pkg',
  'npm-unknown',
];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make modules impossible to reason about and to extract.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'runtime-domain-is-isolated',
      severity: 'error',
      comment: 'The shared kernel must not depend on any other layer.',
      from: { path: '^src/runtime/domain/' },
      to: { path: '^src/', pathNot: '^src/runtime/domain/' },
    },
    {
      name: 'runtime-domain-has-no-packages',
      severity: 'error',
      comment: 'The shared kernel is pure TypeScript: no npm packages and no node:* modules.',
      from: { path: '^src/runtime/domain/' },
      to: { dependencyTypes: NPM_AND_BUILTIN_TYPES },
    },
    {
      name: 'runtime-engine-depends-only-on-domain',
      severity: 'error',
      from: { path: '^src/runtime/engine/' },
      to: { path: '^src/', pathNot: '^src/runtime/(engine|domain)/' },
    },
    {
      name: 'runtime-engine-is-pure',
      severity: 'error',
      comment: 'Heuristics are pure functions over data, so they stay testable without a browser.',
      from: { path: '^src/runtime/engine/' },
      to: { dependencyTypes: NPM_AND_BUILTIN_TYPES },
    },
    {
      name: 'runtime-interceptor-depends-only-on-domain',
      severity: 'error',
      from: { path: '^src/runtime/interceptor/' },
      to: { path: '^src/', pathNot: '^src/runtime/(interceptor|domain)/' },
    },
    {
      name: 'runtime-hud-depends-only-on-domain',
      severity: 'error',
      comment:
        'The HUD mounting layer is handed its component, diff and clipboard by the composition root.',
      from: { path: '^src/runtime/hud/' },
      to: { path: '^src/', pathNot: '^src/runtime/(hud|domain)/' },
    },
    {
      name: 'runtime-components-depend-only-on-domain',
      severity: 'error',
      from: { path: '^src/runtime/components/' },
      to: { path: '^src/', pathNot: '^src/runtime/(components|domain)/' },
    },
    {
      name: 'runtime-must-not-use-build-time-packages',
      severity: 'error',
      comment: 'Build tooling must never be bundled into the browser runtime.',
      from: { path: '^src/runtime/' },
      to: {
        path: 'node_modules/(?:@nuxt/(?:kit|devtools-kit|schema)|unplugin|magic-string|@vue/compiler-sfc|vite)/',
      },
    },
    {
      name: 'runtime-must-not-import-build-time-code',
      severity: 'error',
      comment: 'The runtime may only share runtime/domain with the build-time side.',
      from: { path: '^src/runtime/' },
      to: { path: '^src/', pathNot: '^src/runtime/' },
    },
    {
      name: 'build-time-imports-runtime-domain-only',
      severity: 'error',
      comment:
        'Build-time code references runtime files by path (addPlugin); it never imports them.',
      from: { path: '^src/(module|devtools)\\.ts$|^src/plugins/' },
      to: { path: '^src/runtime/', pathNot: '^src/runtime/domain/' },
    },
    {
      name: 'plugins-depend-only-on-domain',
      severity: 'error',
      from: { path: '^src/plugins/' },
      to: { path: '^src/', pathNot: '^src/(plugins|runtime/domain)/' },
    },
    {
      name: 'plugins-are-nuxt-agnostic',
      severity: 'error',
      comment:
        'Compiler transforms are plain unplugin code so they can be unit-tested without Nuxt.',
      from: { path: '^src/plugins/' },
      to: { path: 'node_modules/@nuxt/' },
    },
    {
      name: 'only-module-imports-plugins',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(plugins/|module\\.ts$)' },
      to: { path: '^src/plugins/' },
    },
    {
      name: 'only-module-imports-devtools',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(module|devtools)\\.ts$' },
      to: { path: '^src/devtools\\.ts$' },
    },
    {
      name: 'src-must-not-import-tests',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^(tests|scripts)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
