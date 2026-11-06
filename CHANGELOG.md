# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
