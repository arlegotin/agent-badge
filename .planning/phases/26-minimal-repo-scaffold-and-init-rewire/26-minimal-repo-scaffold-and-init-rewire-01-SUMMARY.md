---
phase: 26-minimal-repo-scaffold-and-init-rewire
plan: 01
subsystem: cli
tags: [init, initializer, scaffold, hooks, gitignore]
requires:
  - phase: 25-global-runtime-contract-and-command-resolution
    provides: shared runtime reporting, direct hook contract, and PATH-based runtime resolution
provides:
  - pure `create-agent-badge` entrypoint with no post-init runtime installation
  - minimal init-time scaffold reconciliation for `.gitignore` and `pre-push`
  - exact legacy package.json cleanup for managed agent-badge entries
affects: [phase-26, phase-27, init, uninstall, shared-runtime]
tech-stack:
  added: []
  patterns:
    - minimal repo-owned scaffold reconciliation
    - exact-match legacy manifest cleanup
    - pure initializer delegation
key-files:
  created:
    - .planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-minimal-repo-scaffold-and-init-rewire-01-SUMMARY.md
  modified:
    - packages/create-agent-badge/src/index.ts
    - packages/create-agent-badge/src/index.test.ts
    - packages/core/src/init/runtime-wiring.ts
    - packages/core/src/init/runtime-wiring.test.ts
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/init.test.ts
key-decisions:
  - "`create-agent-badge` now delegates directly to `runInitCommand()` and never installs `@legotin/agent-badge` into the target repository."
  - "`runInitCommand()` now uses a minimal scaffold reconciler so fresh repos get repo-owned hook and gitignore artifacts without a generated `package.json`."
  - "Legacy manifest cleanup removes only exact managed agent-badge entries and deletes `package.json` only when no user-owned keys remain."
patterns-established:
  - "Init-time scaffold ownership is separate from runtime distribution."
  - "Legacy package cleanup must preserve unrelated manifest content by exact-value matching."
requirements-completed:
  - DIST-01
  - DIST-02
  - ART-01
duration: 12 min
completed: 2026-04-08
---

# Phase 26 Plan 01: Minimal Init Scaffold Summary

**Pure initializer delegation plus minimal init-time scaffold reconciliation that keeps fresh repos package-json-free while pruning legacy managed runtime entries**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-08T21:46:27Z
- **Completed:** 2026-04-08T21:58:58Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Removed the post-init repo-local runtime installation from `create-agent-badge` and made the initializer a thin `runInitCommand()` delegator.
- Added a new minimal scaffold reconciler that manages `.gitignore` and `pre-push` while cleaning only exact legacy `package.json` entries owned by agent-badge.
- Rewired `init` tests and core scaffold tests so fresh repos stay package-json-free, legacy manifests are preserved safely, and README or hook markers remain single-write across reruns.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: pure initializer coverage** - `98e08b9` (test)
2. **Task 1 GREEN: pure initializer implementation** - `6c790c4` (feat)
3. **Task 2 RED: minimal scaffold coverage** - `2b0803a` (test)
4. **Task 2 GREEN: minimal scaffold implementation** - `9f77270` (feat)

## Files Created/Modified
- `packages/create-agent-badge/src/index.ts` - Removes repo-local runtime installation and delegates directly to `runInitCommand()`.
- `packages/create-agent-badge/src/index.test.ts` - Encodes the pure-initializer contract and package-json-free target repo expectations.
- `packages/core/src/init/runtime-wiring.ts` - Adds `applyMinimalRepoScaffold()` for minimal repo-owned artifacts plus exact legacy manifest cleanup.
- `packages/core/src/init/runtime-wiring.test.ts` - Verifies fresh package-json-free init, legacy cleanup, strict and fail-soft hook behavior, and direct shared hook guards.
- `packages/agent-badge/src/commands/init.ts` - Switches init to the minimal scaffold reconciler while keeping Phase 25 shared-runtime reporting intact.
- `packages/agent-badge/src/commands/init.test.ts` - Verifies default init no longer creates `package.json`, preserves single hook or README markers across reruns, and keeps shared-runtime messaging unchanged.

## Decisions Made

- The initializer no longer owns runtime distribution; it only bootstraps repo-local artifacts and defers runtime availability to the shared CLI contract from Phase 25.
- Minimal scaffold cleanup is exact-match only for `devDependencies.@legotin/agent-badge`, `scripts.agent-badge:init`, and `scripts.agent-badge:refresh` so unrelated manifest content survives reruns.
- Fresh repos remain manifest-free by default; legacy repos converge toward that state only when agent-badge is the sole remaining manifest owner.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `26-02` can build on a stable minimal-artifact init contract: fresh init no longer vendors the runtime or creates `package.json` by default.
- Legacy package manifest cleanup is now exact and test-covered, so follow-up work can focus on remaining config, uninstall, and proof-surface convergence.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally left untouched for the orchestrator, per execution instructions.

## Self-Check: PASSED

- `FOUND: .planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-minimal-repo-scaffold-and-init-rewire-01-SUMMARY.md`
- `FOUND: 98e08b9`
- `FOUND: 6c790c4`
- `FOUND: 2b0803a`
- `FOUND: 9f77270`
- `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/create-agent-badge/src/index.test.ts` passed.
