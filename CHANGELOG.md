# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
