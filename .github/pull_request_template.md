## What and why

<!-- One logical change per pull request. -->

## Checklist

- [ ] `npm run check` passes
- [ ] Tests added or updated
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] Nothing is registered above the `shouldActivate` guard in `src/module.ts` (zero production footprint)
- [ ] Layer rules respected; a new rule comes with a violating fixture
- [ ] Runtime code cannot throw into the host app (failures logged with `[HydrationDoctor:Internal]`)
