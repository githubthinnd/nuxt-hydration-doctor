# nuxt-hydration-doctor

A Nuxt module that finds, diffs and explains Vue 3 SSR hydration mismatches **in development**, and leaves **zero footprint in production builds**.

> Status: pre-release. Phases 1 (scaffolding), 2 (source-location injection), 3 (warning interception) and 4 (HUD) are complete; the features below arrive phase by phase.

Vue's `[Vue warn]: Hydration node mismatch` tells you something is wrong but not where. nuxt-hydration-doctor aims to give you:

1. the exact SFC file, line and component (dev-only template instrumentation),
2. a live capture of Vue's hydration warnings without patching production code,
3. an isolated Shadow DOM HUD with a side-by-side Server HTML vs Client DOM diff,
4. a heuristic root cause (browser globals in SSR, non-deterministic values, invalid HTML nesting, state desynchronisation) with a copy-pasteable fix,
5. a Nuxt DevTools tab with the session history and "Open in Editor" links.

## Install and configure

```bash
npm install nuxt-hydration-doctor   # once published
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-hydration-doctor'],
  hydrationDoctor: {
    // every option is optional; shown with defaults
    enabled: true, // still inert outside `nuxt dev`
    debug: false,
    sourceMap: { attribute: 'data-nhd-loc', exclude: ['/node_modules/'] },
    hud: { enabled: true, autoOpen: true },
    devtools: { enabled: true },
    history: { limit: 50 },
    diagnostics: { disabledCategories: [] },
  },
});
```

Unknown or mistyped options fail the build with the offending option path. Supports Nuxt `^3.15` and `^4`.

## Roadmap

| Phase | Scope                                                               | Status |
| ----- | ------------------------------------------------------------------- | ------ |
| 1     | Scaffolding, Nuxt Kit setup, `src/module.ts`, strict TS and tooling | Done   |
| 2     | Vite AST transform injecting `data-nhd-loc` (dev only)              | Done   |
| 3     | Runtime plugin: warning interception and DOM capture                | Done   |
| 4     | Shadow DOM HUD with visual diff                                     | Done   |
| 5     | Diagnostic engine and fix suggestions                               | Next   |
| 6     | DevTools tab, playground scenarios, Playwright E2E                  | –      |

## Development

```bash
npm install
npm run dev:prepare
npm run check    # format, lint, typecheck, arch, test, build, verify:package
npm run dev      # playground
```

Architecture: [docs/architecture.md](docs/architecture.md). Decisions: [docs/adr](docs/adr/README.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
