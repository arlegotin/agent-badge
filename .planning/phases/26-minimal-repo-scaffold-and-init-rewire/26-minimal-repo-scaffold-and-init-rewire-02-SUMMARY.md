---
phase: 26-minimal-repo-scaffold-and-init-rewire
plan: 02
subsystem: cli
tags: [config, init, hooks, readiness, regression-tests]
requires:
  - phase: 25-global-runtime-contract-and-command-resolution
    provides: shared PATH-based runtime detection, direct hook contract, and legacy hook compatibility boundaries
  - phase: 26-minimal-repo-scaffold-and-init-rewire
    provides: minimal scaffold reconciler and package-json-free init defaults from plan 01
provides:
  - config-driven refresh rewrites that preserve the minimal-artifact scaffold contract
  - legacy rerun proof for single README, gitignore, and managed hook blocks without default runtime manifest ownership
  - readiness-matrix coverage that validates repo artifacts instead of deprecated package scripts
affects: [phase-26, phase-27, config, init, release-proof]
tech-stack:
  added: []
  patterns:
    - refresh policy changes reconcile through artifact-only scaffold ownership
    - readiness proof asserts the shared managed hook contract and denies legacy runner strings
key-files:
  created:
    - .planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-minimal-repo-scaffold-and-init-rewire-02-SUMMARY.md
  modified:
    - packages/agent-badge/src/commands/config.ts
    - packages/agent-badge/src/commands/config.test.ts
    - packages/agent-badge/src/commands/init.test.ts
    - packages/agent-badge/src/commands/uninstall.test.ts
    - packages/agent-badge/src/commands/release-readiness-matrix.test.ts
key-decisions:
  - "`runConfigCommand()` now rewrites refresh policy through `applyMinimalRepoScaffold()` so config cannot recreate managed repo-local runtime ownership."
  - "Phase 26 readiness proof treats `package.json` runtime ownership as absent by default and validates `.agent-badge/*`, `.gitignore`, README markers, and the managed hook instead."
patterns-established:
  - "Minimal-artifact convergence is enforced at both command and readiness-proof layers."
  - "Legacy hook runner strings remain only as denylist regressions, never as expected output."
requirements-completed:
  - DIST-01
  - DIST-02
  - ART-01
  - ART-02
duration: 4 min
completed: 2026-04-09
---

# Phase 26 Plan 02: Minimal Artifact Convergence Summary

**Config-driven hook rewrites, legacy rerun cleanup, and readiness proof now all enforce the package-json-free minimal-artifact contract**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-08T22:08:33Z
- **Completed:** 2026-04-08T22:12:55Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Rewired `config set refresh.prePush.*` to the minimal scaffold reconciler so refresh-policy mutations only rewrite repo-owned artifacts.
- Added convergence coverage proving legacy reruns keep one managed README block, one managed gitignore block, one managed hook block, and no default `@legotin/agent-badge` manifest ownership.
- Replaced release-readiness matrix assumptions about `package.json#scripts.agent-badge:refresh` with checks over `.agent-badge/*`, `.gitignore`, the shared hook contract, README markers, and the legacy-runner denylist.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: minimal scaffold convergence coverage** - `71a94ff` (test)
2. **Task 1 GREEN: config refresh rewrites on minimal scaffold** - `3d07f1b` (feat)
3. **Task 2: readiness matrix minimal-artifact proof** - `9612f32` (test)

## Files Created/Modified
- `.planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-minimal-repo-scaffold-and-init-rewire-02-SUMMARY.md` - execution summary for plan 26-02.
- `packages/agent-badge/src/commands/config.ts` - routes refresh-setting mutations through minimal scaffold reconciliation.
- `packages/agent-badge/src/commands/config.test.ts` - proves config rewrites update only repo-owned hook state and legacy runtime ownership is removed.
- `packages/agent-badge/src/commands/init.test.ts` - adds legacy rerun convergence coverage for README, hook, gitignore, and manifest cleanup.
- `packages/agent-badge/src/commands/uninstall.test.ts` - aligns uninstall expectations with package-json-free Phase 26 defaults.
- `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` - encodes the Phase 26 readiness contract with artifact checks and legacy-runner denylist assertions.

## Decisions Made

- Refresh-policy mutations remain repo-owned behavior, but they must reconcile only `.git/hooks/pre-push` and related scaffold artifacts instead of reintroducing repo-local runtime package ownership.
- The readiness matrix is now the proof surface for the minimal-artifact contract, so it validates repo artifacts directly and treats legacy wrapper strings as regressions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The existing release-readiness matrix still read `package.json` to find `agent-badge:refresh`, which failed immediately once Phase 26 removed default manifest ownership. The matrix was rewritten to assert the real shared-hook and repo-artifact contract instead.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `27-01` can build on a fully aligned Phase 26 contract: init, config rewrites, legacy reruns, and readiness proof all agree that repo-local runtime ownership is absent by default.
- Legacy hook cleanup compatibility remains covered, so Phase 27 can focus on migration UX, uninstall/docs updates, and external smoke proof.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally left untouched for the orchestrator, per execution instructions.

## Self-Check: PASSED

- `FOUND: .planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-minimal-repo-scaffold-and-init-rewire-02-SUMMARY.md`
- `FOUND: 71a94ff`
- `FOUND: 3d07f1b`
- `FOUND: 9612f32`
- `npm test -- --run packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/init.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/uninstall.test.ts` passed.
- `npm test -- --run packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/agent-badge/src/commands/init.test.ts` passed.
