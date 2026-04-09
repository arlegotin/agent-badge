# Quick Task 260409-n4x Summary

## Goal

Remove fake badge-example data from the public README, make generated badge links consistently point to the `agent-badge` project, and carry the change through verification and the release workflow handoff.

## Completed Tasks

### 1) Replace fake README badge examples with live data

- Updated [README.md](/Volumes/git/legotin/agent-badge/README.md) so the hero badge is a valid linked badge pointing to `https://github.com/arlegotin/agent-badge`.
- Replaced the static `img.shields.io/badge/...42 tokens...` gallery rows with live endpoint badges backed by the repo gist payloads, using Shields query overrides for style, label, and color previews.
- Added a docs guard in [scripts/verify-docs.sh](/Volumes/git/legotin/agent-badge/scripts/verify-docs.sh) that forbids reintroducing static Shields badge URLs or fake `42` / `$58` placeholder values in the README gallery.
- Commit: `e9baab2`

### 2) Lock the generated badge-link contract in code and tests

- Added the canonical project URL constant in [readme-badge.ts](/Volumes/git/legotin/agent-badge/packages/core/src/publish/readme-badge.ts) and updated [init.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.ts) so managed README badges and fallback badge snippets always link to `https://github.com/arlegotin/agent-badge`.
- Updated [init.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.test.ts) and [readme-badge.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/publish/readme-badge.test.ts) to assert the project-link behavior directly.
- Commit: `e9baab2`

### 3) Verify release readiness and hand off to the push-based release path

- Passed local verification:
  - `npm test -- --run packages/core/src/publish/readme-badge.test.ts packages/agent-badge/src/commands/init.test.ts`
  - `npm run build`
  - `npm run typecheck`
  - `npm run docs:check`
- Confirmed release impact with `npm run release:publish-impact -- --base HEAD~1 --head HEAD`, which detected publishable changes in `packages/agent-badge/src/commands/init.ts` and `packages/core/src/publish/readme-badge.ts`.
- Ran `npm run release:preflight`; it correctly reported the checked-in `1.1.17` manifests as already published and local `npm whoami` as unauthorized, while still marking the release workflow contract safe and noting that the production workflow auto-bumps on push.
- Added the planned `1.1.18` changelog entry in [CHANGELOG.md](/Volumes/git/legotin/agent-badge/CHANGELOG.md) so the repo is ready for the workflow-generated patch release.
- Commit: `e9baab2`

## Extra Verification

- `curl -s "<live Shields URL>"` returned an SVG with live current data for the label/color override example (`AI receipt: $570`), confirming the gallery no longer relies on static placeholder numbers.

## Notes

- The production release path is the `main` push workflow in `.github/workflows/release.yml`; local `release:preflight` remains blocked until the workflow performs the patch auto-bump.
- `ROADMAP.md` was not modified.
