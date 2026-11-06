# nuxt-hydration-doctor

A Nuxt module that finds, diffs and explains Vue 3 SSR hydration mismatches **in development**, and leaves **zero footprint in production builds**.

> Status: pre-release. All six phases are implemented (scaffolding, source-location injection, warning interception, HUD, diagnostics, DevTools tab and playground). Not published yet.

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
    hud: { enabled: true, autoOpen: true, position: 'bottom-right' }, // or bottom-left, top-right, top-left
    devtools: { enabled: true },
    history: { limit: 50 },
    diagnostics: { disabledCategories: [] },
  },
});
```

Unknown or mistyped options fail the build with the offending option path. Supports Nuxt `^3.15` and `^4`.

## Moving the badge

The badge may land where another debug bar already is, so it can be moved: drag it anywhere (mouse, touch or pen), or focus it and press **Alt + an arrow key**. The place you leave it is remembered in `localStorage`, and **Reset position** in the panel brings it back to the corner set by `hud.position`. The panel opens on the badge's side of the screen, next to it. A click that does not move the badge still opens and closes the panel.

## What it recognises

Vue's text, node, children, class, style and attribute hydration warnings. For each mismatch you get the component and the source line, the server markup against the client DOM, and, when the evidence supports one, a likely cause with a fix you can paste:

| Cause                      | What gives it away                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser-only value         | the client text contains the live value of `window.innerWidth`, `navigator.userAgent`, a `localStorage` entry…; `window`/`document` read in `setup`                   |
| Non-deterministic value    | timestamps seconds apart, a whole-hour difference (time zone), 12h against 24h (locale), different UUIDs or random decimals; `Date.now()`, `Math.random()` in `setup` |
| Invalid HTML nesting       | `<div>` in `<p>`, `<tr>` outside `<tbody>`, `<a>` in `<a>`… (the browser's parser repairs the server HTML, Vue does not repair its own DOM)                           |
| State changed before mount | a `useState` or Pinia value differs from what the server serialised                                                                                                   |

A diagnosis states the evidence it rests on and a confidence; when nothing matches, it says so instead of guessing.

## Verified against

| Nuxt                  | Checked                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| 4.6.4 (DevTools 3.4)  | the whole suite, a production build, the built `dist/` in a separate project         |
| 3.21.11               | the built `dist/` in a separate project: registers in development, nothing otherwise |
| 3.15.0 (DevTools 1.7) | the same                                                                             |

"Checked" means loaded in a real Nuxt and inspected for what it registers, plus the test suites below. What has not been run is a browser against the dev server (see the roadmap note).

## Known limits

- Only single-file components are located: render functions, JSX/TSX and Pug (`lang` other than `html`) templates get no `data-nhd-loc`, so a mismatch in them is reported without a source line. A PascalCase native tag such as `<DIV>` is treated as a component by Vue and is skipped too.
- The server markup is captured from the application root and the teleport container before hydration. A mismatch outside both has no server side to compare.
- Vue only _checks_ class, style and attribute mismatches and does not repair them, so for those the "client" markup still holds the server's value; the exact values are in the message.
- A report needs the dev endpoint (`/__nhd`), which Nuxt mounts at the server root. It answers loopback names and IP addresses; reaching the dev server through another host name needs that name in `devServer.host` or `vite.server.allowedHosts`.
- "Open in editor" works for files of the project and of its Nuxt layers, through Nuxt's own `/__open-in-editor` route, and not for anything else.
- Heuristics can be wrong. A diagnosis below 55% confidence is labelled low; below 30% it is not shown.

## Roadmap

| Phase | Scope                                                               | Status |
| ----- | ------------------------------------------------------------------- | ------ |
| 1     | Scaffolding, Nuxt Kit setup, `src/module.ts`, strict TS and tooling | Done   |
| 2     | Vite AST transform injecting `data-nhd-loc` (dev only)              | Done   |
| 3     | Runtime plugin: warning interception and DOM capture                | Done   |
| 4     | Shadow DOM HUD with visual diff                                     | Done   |
| 5     | Diagnostic engine and fix suggestions                               | Done   |
| 6     | DevTools tab, playground scenarios, Playwright E2E                  | Done\* |

\* The Playwright suite is written, type-checked and wired into a CI job, but it has never been run: not in the environment this was built in (no browser, no local port), and the CI job has not run yet because the repository has not been pushed. Everything else in the phase is covered by tests that do run; see [ADR-0004](docs/adr/0004-devtools-transport-and-endpoint-security.md).

## Development

```bash
npm install
npm run dev:prepare
npm run check    # format, lint, typecheck, arch, test, build, verify:package, verify:production
npm run dev      # playground at http://localhost:3000, one page per deliberate mismatch
```

The [playground](playground/pages/index.vue) has a page for each cause the doctor recognises (clock, random value, `window`, `localStorage`, `<div>` in `<p>`, `<tr>` in `<table>`, state changed before hydration) and a control page that hydrates cleanly. Open one with a full page load: the HUD appears bottom right, and the same report shows up in the **Hydration Doctor** tab of Nuxt DevTools.

End-to-end tests drive a real browser against the dev server:

```bash
npx playwright install chromium   # once
npm run test:e2e
```

Architecture: [docs/architecture.md](docs/architecture.md). Decisions: [docs/adr](docs/adr/README.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
