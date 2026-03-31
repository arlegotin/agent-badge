---
phase: 07-release-readiness
plan: 02
subsystem: infra
tags: [npm-workspaces, changesets, github-actions, packaging, smoke-tests]
requires:
  - phase: 07-release-readiness
    provides: plan 01 CI matrix and release-readiness scenario coverage
  - phase: 01-workspace-and-init-foundation
    provides: workspace package layout and CLI package split
provides:
  - publish-safe package dependency contracts for workspace runtime packages
  - deterministic tarball pack/install/import smoke validation script
  - dedicated release workflow with pre-publish quality gates and changesets publish path
affects: [release-automation, npm-publishing, phase-07-plan-03-docs]
tech-stack:
  added: []
  patterns:
    - workspace runtime dependencies use publish-safe semver ranges instead of local file specifiers
    - release job executes typecheck/build/test/pack/smoke gates before changesets publish
key-files:
  created:
    - scripts/smoke/verify-packed-install.sh
    - .github/workflows/release.yml
  modified:
    - package.json
    - packages/core/package.json
    - packages/agent-badge/package.json
    - packages/create-agent-badge/package.json
    - packages/core/tsconfig.json
    - packages/agent-badge/tsconfig.json
    - packages/create-agent-badge/src/index.ts
key-decisions:
  - "Recovered existing valid task commits instead of rewriting completed work to keep task history atomic."
  - "Release verification used an isolated npm cache when local ~/.npm permissions were invalid."
patterns-established:
  - "Pack-level smoke checks must validate imports and CLI binaries from tarballs in a clean temporary install."
  - "Release workflow permissions include id-token write for trusted publishing and optional NPM_TOKEN fallback."
requirements-completed: [REL-01, REL-02]
duration: 7min
completed: 2026-03-31
---

# Phase 07 Plan 02: Packaging and Release Automation Summary

**Workspace package manifests are publish-safe, tarball smoke validation is automated, and a changesets-driven release workflow now enforces pre-publish quality gates.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-31T09:04:30Z
- **Completed:** 2026-03-31T09:11:31Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Recovered and validated Task 1 commit `3b5e22d` which replaced runtime-breaking `file:` workspace dependency specifiers with publish-safe semver contracts and added release scripts.
- Recovered and validated Task 2 commit `8484660` which added tarball pack/install/import smoke validation and a dedicated release workflow using `changesets/action@v1`.
- Verified `bash scripts/smoke/verify-packed-install.sh` succeeds and confirmed `npm run pack:check` succeeds with an isolated npm cache.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace runtime-breaking workspace file dependencies with publish-safe package contracts** - `3b5e22d` (chore)
2. **Task 2: Add tarball smoke script and release workflow with pre-publish gates** - `8484660` (feat)

**Plan metadata:** pending (added in final docs commit)

## Files Created/Modified
- `package.json` - Added `pack:check`, `smoke:pack`, `changeset`, and `release` scripts.
- `packages/core/package.json` - Added public `publishConfig`.
- `packages/agent-badge/package.json` - Switched `@agent-badge/core` to publish-safe `^0.0.0`.
- `packages/create-agent-badge/package.json` - Switched runtime dependency to `agent-badge@^0.0.0` and removed direct core dependency.
- `packages/core/tsconfig.json` - Added test-file emit exclusion.
- `packages/agent-badge/tsconfig.json` - Added test-file emit exclusion.
- `scripts/smoke/verify-packed-install.sh` - Added pack/install/import/bin smoke script for all workspace packages.
- `.github/workflows/release.yml` - Added release workflow with typecheck/build/test/pack/smoke gates and changesets publish.
- `packages/create-agent-badge/src/index.ts` - Updated initializer runtime integration to align with published package contracts.

## Decisions Made
- Preserved prior valid commits (`3b5e22d`, `8484660`) as canonical task commits and completed only execution metadata/state updates.
- Treated the `npm run build` type error in `packages/core/src/publish/github-gist-client.ts` as a pre-existing out-of-scope issue for this plan and kept it tracked in deferred items.

## Deviations from Plan

None for planned implementation scope. The plan tasks were already completed in valid prior commits and were recovered without rewriting.

## Issues Encountered
- `npm run build` fails with `TS2352` in `packages/core/src/publish/github-gist-client.ts` (pre-existing, documented in `deferred-items.md`).
- Local `~/.npm` cache permissions caused `npm run pack:check` EPERM; verification succeeded with a temporary isolated npm cache.

## User Setup Required
Manual release setup is still required before first publish:
- Configure npm trusted publishing for this repository (preferred), or
- Set GitHub repository secret `NPM_TOKEN` as fallback for release workflow publish.

## Next Phase Readiness
- Packaging and release automation gates are in place and verified for Plan 07-02 scope.
- Phase 07 Plan 03 can proceed with publish-time documentation and release runbook completion.

---
*Phase: 07-release-readiness*
*Completed: 2026-03-31*

## Self-Check: PASSED
- FOUND: .planning/phases/07-release-readiness/07-02-SUMMARY.md
- FOUND: 3b5e22d
- FOUND: 8484660
