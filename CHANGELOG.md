# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Movable badge

- The HUD badge can be dragged anywhere (pointer events: mouse, touch, pen) and moved with Alt + arrow keys, because it can sit on top of another debug bar. A press that moves less than 4 px is still a click, and the click that follows a drag does not toggle the panel.
- The position is kept as fractions of the free space (0 to 1, rounded to 4 decimals), so it survives window resizes and a badge that grows, and CSS places it without measuring. It is remembered in `localStorage` (a throwing or blocked storage is tolerated), validated on the way back in, and "Reset position" returns it to the corner.
- The panel docks to the screen edges nearest the badge, so it opens beside it and never off screen.
- New option `hud.position` (`bottom-right` default, `bottom-left`, `top-right`, `top-left`) and public type `HudCorner`.
- Tests: the position arithmetic, and the real component driven with pointer and keyboard events (31 cases); two Playwright cases (not run).

### Review pass (after Phase 6)

An independent review plus a verification of everything that had only been assumed. Each fix below has a test that fails without it.

**Fixed**

- The DevTools tab broke (`Cannot reach the dev server`) when a report's page load id was `__proto__`, `constructor`, `toString`… (grouping used a plain object): it now uses a `Map`.
- A report could be refused by the server for ordinary reasons (a URL with a long query string, an element with more than 64 ancestors, a long text mismatch), so the issue never reached the tab. The reporter now trims every field to the limits the server enforces (`fitReport`, one shared limits table).
- DNS rebinding and exposed dev servers: the endpoint now refuses `Host` headers that are foreign domain names, and cross-origin `Origin`s. IP addresses and loopback names keep working; other names come from `devServer.host` / `vite.server.allowedHosts`.
- The request body was buffered whole when a request had no `Content-Length`: it is now read as a counted stream and refused at 256 KB.
- A tab left open across a dev-server restart never showed new reports (sequence numbers restart); the registry now has an epoch.
- A component with several root elements (a fragment) was reported as its caller's element, file and markup; its own roots are now found through the vnode tree.
- Another plugin assigning `app.config.warnHandler` after the doctor silently switched capturing off: `warnHandler` is now an accessor that chains the later handler after ours.
- `$hydrationDoctor` was typed `{}`/`unknown` in a Nuxt project: Nuxt infers it from the plugin, whose annotation had erased the type. The plugin is now typed precisely and a fallback declaration (optional) is written only when the module is inactive.
- The injected attribute value was not escaped: a file name containing `"` could add attributes to a template. It is escaped now.
- Quadratic time in two regular expressions applied to page content (about 1.6 s for a message of 60 000 newlines): replaced by a linear scan and by collapsing whitespace first.
- The server snapshot ignored teleported content: the teleport container is now included.

**Added**

- Class, style and attribute hydration mismatches (Vue 3.5 wording), including diagnosis from their values.
- "Open in editor" in the HUD, and for files of Nuxt layers (`GET /__nhd/open`).
- `npm run verify:dist` (smoke tests of the built package: module entry, engine, codec, interceptor on a real hydration, the HUD component as shipped) and `npm run verify:nuxt-types` (type-checks `$hydrationDoctor` in a Nuxt project in both modes), both in `check` and CI.
- Verified by loading the built `dist/` in separate projects: Nuxt 4.6.4, 3.21.11 and 3.15.0.
- `CODE_OF_CONDUCT.md` and issue templates.

**Changed**

- Removed the unused `@nuxt/test-utils` dependency.

### Added (Phase 6)

- **Nuxt DevTools tab** "Hydration Doctor" (`src/devtools/`): a session history of captured mismatches with breadcrumbs, timings (ms after navigation start, time received), the diagnosis and fix, the server/client markup, and **Open in Editor** links through Nuxt's own `/__open-in-editor` (paths confined to the project). Registered with `addCustomTab` from `@nuxt/devtools-kit@^3` (the version matching the DevTools Nuxt 4.6 ships).
- Dev-only endpoint at `/__nhd` (`addDevServerHandler`) fed by the browser (`runtime/bridge/reporter.ts`). Defences: cross-site requests refused, `x-nhd-client` header required on writes, 256 KB body cap, strict payload validation (`parseHydrationReport`), strict CSP on the page, bounded history. See ADR-0004 and SECURITY.md.
- Registered only when both `devtools.enabled` and Nuxt DevTools are on, and only in development; `verify:production` now also scans for `__nhd` and `x-nhd-client`.
- Playground: seven deliberate scenarios (clock, random value, `window`, `localStorage`, `<div>` in `<p>`, `<tr>` in `<table>`, state changed before hydration) and a control page.
- Playwright suite (`tests/e2e`, `npm run test:e2e`, CI job) covering every scenario, the HUD, the DevTools tab and the endpoint's defences. **Not run in the development sandbox** (no browser, no local port).
- `tests/integration/playground-scenarios.test.ts`: every scenario rendered by Vite SSR from the page's own `.vue`, hydrated in the client build and diagnosed, with the source locations checked against the files.
- `h3` is now a direct dependency; `@nuxt/devtools-kit` moved from `^4.1.0` to `^3.4.4`.

### Added (Phase 5)

- `runtime/engine/diagnostics.ts` (`diagnoseIssue`) and four rules in `runtime/engine/rules/`: **browser global leaks**, **non-deterministic values** (current time, random values, time zone, locale), **invalid HTML nesting** and **state desynchronisation**. Each returns an explanation, the evidence it saw, a confidence and a copy-pasteable fix; results below the minimum confidence are dropped and a failing rule is skipped.
- Evidence the rules use: text differences, live browser values (`interceptor/environment.ts`), the component's compiled `setup`/`render` text (`issue.componentSource`, scanned by `engine/source-scan.ts`), element ancestry (`issue.ancestry`), and `useState`/Pinia values that differ from the server payload (`interceptor/state-watch.ts`).
- HUD: **Likely cause** section (title, confidence word and percentage, evidence, fix code with Copy fix); `diagnostics.disabledCategories` is honoured.
- `HydrationIssue.ancestry` and `HydrationIssue.componentSource`; `HudEntry.diagnostics`; the HTML tokenizer is shared (`engine/html-tokens.ts`).
- The interceptor no longer loses a warning when an unusual component instance throws while its source is read.
- Tests: rule units with "must stay quiet" cases, source scanner, runtime facts, and end-to-end diagnoses of real Vue hydration mismatches.

### Added (Phase 4)

- `HydrationDoctorHUD.vue` (`runtime/components`): presentational HUD, props in and events out. Floating badge with the mismatch count, issue tabs, source location (with Copy), message, breadcrumbs, and a side-by-side **Server Rendered HTML** / **Client Rendered DOM** diff with matching rows, changed rows (diverging part marked) and added/removed rows. Page content is only ever rendered as text; `vue/no-v-html` is an error.
- `runtime/hud/mount-hud.ts`: mounts the HUD in an open Shadow DOM root on a host reset with `all: initial`, outside the application root so it is never hydrated. Its stylesheet is rendered inside the shadow root, so no CSS leaks in either direction. Escape closes the panel; `hud.autoOpen` opens it on the first issue.
- `runtime/hud/overlay.ts`: red outline per issue, tracked in viewport coordinates (scroll in any scroller, resize, ResizeObserver, one animation frame per burst, notify only on change); clicking a label selects the issue. Elements are re-resolved by location and occurrence on every update.
- `runtime/engine/html-diff.ts`: pure HTML diff (tokenise, one node per line, LCS alignment, inline marking of the differing part, hidden attributes such as `data-nhd-loc`, 400-line cap).
- `HydrationIssue.occurrence` (index among elements sharing a location) so the overlay can find the same element again.
- Tooling: `vue-tsc`, `tsconfig.isolated.json` (strict `.ts` check) and a `verify:package` guard against empty declaration files (mkdist had emitted empty `.vue.d.ts` while reporting success) and `eslint-plugin-vue` for `.vue`, `@vitejs/plugin-vue` for the tests, `src/vue-shim.d.ts`, a `runtime-hud-depends-only-on-domain` arch rule with fixtures.

### Added (Phase 3)

- Runtime interceptor (`src/runtime/interceptor`): installs `app.config.warnHandler` (chaining any existing handler, and printing like Vue when there is none) and listens to `vue:error`; recognises Vue's text, node and children hydration mismatches (including the 3.5 "text content mismatch" wording).
- Pre-hydration snapshot of the server markup, taken by an `enforce: 'pre'` plugin, because Vue's warning text cannot carry markup in real browsers (DOM nodes are stringified as `[object …]`).
- Two-step capture: facts at warn time, element/location/markup after Vue has patched. The offending element is narrowed (own text for text mismatches, tag for node mismatches); repeated `v-for` instances are told apart by occurrence index.
- `HydrationIssue` now carries location, server/client HTML, breadcrumbs and metrics; `useNuxtApp().$hydrationDoctor` (`HydrationDoctorApi`: `issues()`, `subscribe()`, `clear()`) exposes the bounded session history. New public type `HydrationDoctorApi`.
- Tests: pure units, happy-dom DOM tests, and an integration suite that runs real Vue hydrations (no simulated warnings).

### Added (Phase 2)

- `src/plugins/inject-locations.ts`: pure transform that stamps every plain template element with `data-nhd-loc="file:line:column"` using `@vue/compiler-sfc` and `magic-string` (with source map). Skips `<template>`, `<slot>`, components, Pug/external templates and malformed files; idempotent.
- `src/plugins/ast-injector.ts`: unplugin wrapper (`pre`, serve-only, `.vue` main requests only, honours `sourceMap.exclude`), registered by the module below the activation guard for both client and SSR builds.
- Tests: transform and plugin unit tests, a real-Nuxt activation test (`dev`, production, disabled), and `npm run verify:production`, a production-build scan wired into `check` and CI.

### Added

- Phase 1: module scaffolding on `@nuxt/module-builder`; `src/module.ts` with option validation and a development-only activation guard (`shouldActivate`).
- Shared kernel in `src/runtime/domain`: `ModuleOptions`, `HydrationIssue`, `DiagnosticResult` and related types, `HydrationDoctorError`, runtime option parsing.
- Placeholder `src/runtime/plugin.client.ts` that validates its options and never throws into the host app.
- Layer rules (`dependency-cruiser`) with violating fixtures, a no-DOM/no-Node type-check of the pure layers, manifest invariants, and a guard for the public type surface.
- Playground, CI workflow, ADR-0001 to ADR-0003.
