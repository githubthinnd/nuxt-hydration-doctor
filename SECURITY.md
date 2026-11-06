# Security policy

## Supported versions

The project is pre-release (0.0.0, not published). Security fixes are made on the default branch.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately using GitHub's "Report a vulnerability" feature on the repository's Security tab, or email **thinnd.work@gmail.com** with the subject `nuxt-hydration-doctor security`.

Include the version, a minimal reproduction, and the impact you expect.

## Security properties and limits

- **Development only.** The module registers nothing unless Nuxt runs in development mode with `enabled: true`. In production builds there is no plugin, no injected attribute, no runtime config and no DevTools tab. This is a design guarantee covered by tests (see `docs/adr/0002-zero-production-footprint.md`).
- **Source paths are exposed in development.** The injected `data-nhd-loc` attribute reveals project-relative file paths and line numbers to anyone who can load the dev server. Do not expose a dev server to untrusted networks.
- **Page content goes to your dev server, and nowhere else.** The browser sends each captured mismatch (the offending element's server and client markup, the message, the diagnosis, source paths) to the Nuxt dev server so the DevTools tab can list it; it is kept in memory (at most 200 reports) and lost when the dev server stops. Nothing is sent to any other host. The component's compiled code and the values of state and storage are never sent or listed. Errors raised by the module never include page content.
- **The dev endpoint (`/__nhd`) is attack surface.** It exists only in development and only when the DevTools integration is on. Cross-site requests are refused, writes need a custom header that other sites cannot add, request bodies are capped at 256 KB and validated field by field, the tab page is served with a strict Content-Security-Policy and builds its DOM from text only, and "Open in Editor" paths are confined to the project directory. It has no authentication: anyone who can reach the dev server can read the reports (and, through Vite, your source). Keep the dev server on localhost or a trusted network. See `docs/adr/0004-devtools-transport-and-endpoint-security.md`.
- **Configuration is validated.** Unknown or mistyped options fail the build with the option path; the browser re-validates what it receives through `runtimeConfig` and ignores anything malformed.
- **Build tooling runs with your privileges.** The module is a Nuxt module like any other: install it only from sources you trust.
