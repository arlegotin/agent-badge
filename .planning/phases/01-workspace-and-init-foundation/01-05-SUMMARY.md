---
phase: 01-workspace-and-init-foundation
plan: 05
subsystem: infra
tags: [init, runtime-wiring, hooks, package-manager, vitest]
requires:
  - phase: 01-04
    provides: shared git bootstrap plus preflight/scaffold orchestration for safe init mutations
provides:
  - repo-local runtime wiring service that manages package scripts, dependency entries, and the pre-push hook
  - init orchestration that derives runtime dependency specs from the runtime package manifest
  - regression coverage proving init wiring is idempotent and the managed hook remains runnable
affects: [phase-01-verification, init-flow, refresh-automation, phase-05]
tech-stack:
  added: []
  patterns:
    - package scripts use bare local-bin commands while git hooks invoke the refresh script through the detected package manager
    - init separates `.agent-badge` scaffold reporting from repo-local runtime wiring reporting
key-files:
  created:
    - packages/core/src/init/runtime-wiring.ts
    - packages/core/src/init/runtime-wiring.test.ts
  modified:
    - packages/core/src/runtime/local-cli.ts
    - packages/core/src/init/index.ts
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/init.test.ts
key-decisions:
  - "Derive target `agent-badge` dependency specs from `packages/agent-badge/package.json`, falling back to `latest` when the runtime version is `0.0.0` or otherwise not publishable."
  - "Keep package scripts package-manager-neutral (`agent-badge ...`) and let the managed hook invoke `agent-badge:refresh` through the detected package manager."
patterns-established:
  - "Managed hook ownership is delimited by stable `agent-badge:start` / `agent-badge:end` markers so reruns update one block instead of appending duplicates."
  - "Init command tests must assert both returned wiring summaries and on-disk repo mutations across reruns."
requirements-completed: [BOOT-03]
duration: 9 min
completed: 2026-03-30
---

# Phase 01 Plan 05: Repo-Local Runtime Wiring Summary

**Init now installs repo-local `agent-badge` dependency/scripts and a failure-soft managed `pre-push` hook from runtime package metadata**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-30T09:50:20Z
- **Completed:** 2026-03-30T09:59:34Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added a dedicated core runtime-wiring service that creates or updates `package.json` and `.git/hooks/pre-push` without touching `.agent-badge` scaffold logic.
- Extended init so it derives the target repo’s `agent-badge` dependency spec from the runtime package manifest, applies repo-local wiring after scaffold, and prints a dedicated runtime-wiring summary.
- Locked the behavior with tests that prove the generated hook is executable on first run, reruns keep a single managed hook block, and init never leaks the initializer’s workspace `file:` dependency into target repos.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create an idempotent runtime-wiring service and safe script/hook templates** - `0e3600c` (`feat`)
2. **Task 2: Wire runtime integration into init and prove the target repo gains it** - `a47e45b` (`feat`)

## Files Created/Modified
- `packages/core/src/init/runtime-wiring.ts` - Writes repo-local dependency, script, and managed-hook wiring with idempotent merge behavior.
- `packages/core/src/runtime/local-cli.ts` - Separates bare package-script commands from package-manager-specific hook runner commands.
- `packages/agent-badge/src/commands/init.ts` - Applies runtime wiring after scaffold and normalizes the target dependency spec from the runtime package manifest.
- `packages/agent-badge/src/commands/init.test.ts` - Verifies end-to-end init wiring, rerun convergence, and protection against leaking the initializer’s `file:` dependency.

## Decisions Made
- Used `packages/agent-badge/package.json` as the only source of truth for target repo runtime dependency wiring, which keeps workspace-only initializer metadata out of initialized repos.
- Kept hook installation agent-owned only inside a marker-delimited block so unrelated hook content survives reruns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed a cross-package test import that broke `packages/core` typecheck**
- **Found during:** Task 2 verification
- **Issue:** `packages/core/src/init/runtime-wiring.test.ts` imported `@agent-badge/testkit`, but the `packages/core` TypeScript project does not include sibling package sources, so `npm run typecheck` failed.
- **Fix:** Replaced the shared-fixture import with a local temp-repo helper inside the core test file.
- **Files modified:** `packages/core/src/init/runtime-wiring.test.ts`
- **Verification:** `npm run typecheck`; `npm test -- --run packages/core/src/runtime/local-cli.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts`
- **Committed in:** `a47e45b` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The auto-fix was required to keep the workspace typecheck green after adding the new runtime-wiring coverage. No scope creep.

## Issues Encountered
- `tsc -b` emitted untracked `.js` and `.d.ts` files into `packages/testkit/src`; they were removed before the Task 2 commit so the worktree stayed clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

BOOT-03 is now satisfied at the init command boundary and backed by end-to-end coverage. Phase 1 has all five plans complete and is ready for re-verification/closeout before Phase 2 begins.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/01-workspace-and-init-foundation/01-05-SUMMARY.md`.
- Verified task commit `0e3600c` exists in git history.
- Verified task commit `a47e45b` exists in git history.
