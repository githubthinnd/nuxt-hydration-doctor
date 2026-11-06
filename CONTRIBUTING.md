# Contributing

Thanks for helping. This project aims to be a small, correct Nuxt module with a hard guarantee: **nothing of it reaches a production build**. Changes are judged on correctness, clarity and maintenance cost.

## Setup

```bash
npm install
npm run dev:prepare   # stub build + generated types for the playground
npm run check
```

Developing here needs Node `^22.22.3 || ^24.15` (the dev dependencies Nuxt 4.6 and Vitest 5 require it); the published package itself supports `^20.19.0 || >=22.12.0`. `npm run check` runs formatting, lint, type checks (including one that compiles `runtime/domain` and `runtime/engine` with no DOM or Node typings), the architecture rules, all tests, the build, and the public-type and publint verification.

## Ground rules

- **Zero production footprint.** Everything that touches `nuxt.options` goes below the `shouldActivate` guard in `src/module.ts`. Do not rely on tree-shaking.
- **Respect the layers.** `npm run arch` fails on forbidden imports; do not weaken a rule to make a change pass. A new rule needs a fixture under `tests/architecture/fixtures` that triggers it.
- **Never crash the host app.** Runtime code catches its own failures and logs them with the `[HydrationDoctor:Internal]` prefix.
- **No silent behaviour.** Unknown or invalid options raise `HydrationDoctorError` with the option path. Errors and logs never include page content (server HTML can hold user data).
- **Public types** are exported from `src/module.ts` and listed in `scripts/verify-types.mjs`; changing the surface needs a changelog entry.
- **Never skip, weaken or delete a test to get a green build.** If a test is wrong, fix it and say why in the pull request.

## Pull requests

1. Open an issue first for anything beyond a small fix.
2. Keep the change focused; add or update tests and documentation.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat(plugins): …`, `fix(runtime): …`).
4. Make sure `npm run check` passes.

## Reporting security problems

See [SECURITY.md](SECURITY.md). Do not file public issues for vulnerabilities.
