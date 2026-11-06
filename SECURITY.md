# Security policy

## Supported versions

The project is pre-release (0.0.0, not published). Security fixes are made on the default branch.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately using GitHub's "Report a vulnerability" feature on the repository's Security tab, or email **thinnd.work@gmail.com** with the subject `nuxt-hydration-doctor security`.

Include the version, a minimal reproduction, and the impact you expect.

## Security properties and limits

- **Development only.** The module registers nothing unless Nuxt runs in development mode with `enabled: true`. In production builds there is no plugin, no injected attribute, no runtime config and no DevTools tab. This is a design guarantee covered by tests (see `docs/adr/0002-zero-production-footprint.md`).
- **Source paths are exposed in development.** The injected `data-nhd-loc` attribute reveals project-relative file paths and line numbers to anyone who can load the dev server. Do not expose a dev server to untrusted networks.
- **Page content stays local.** Server HTML and DOM snapshots are kept in the browser session and shown in the HUD and DevTools. Errors raised by the module never include them.
- **Configuration is validated.** Unknown or mistyped options fail the build with the option path; the browser re-validates what it receives through `runtimeConfig` and ignores anything malformed.
- **Build tooling runs with your privileges.** The module is a Nuxt module like any other: install it only from sources you trust.
