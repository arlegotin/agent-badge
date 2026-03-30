---
phase: 01-workspace-and-init-foundation
plan: 04
subsystem: infra
tags: [init, git, bootstrap, preflight, vitest]
requires:
  - phase: 01-03
    provides: shared init preflight, scaffold orchestration, and init integration coverage
provides:
  - shared git bootstrap helper that keeps preflight non-mutating
  - init orchestration that reruns preflight after `git init --quiet`
  - regression coverage for allowed and blocked non-git init paths
affects: [phase-01-gap-closure, init-flow, phase-01-plan-05]
tech-stack:
  added: []
  patterns:
    - bootstrap mutates git state only after preflight allows it and before scaffold writes
    - init returns a refreshed preflight object after bootstrap so downstream steps see real repo state
key-files:
  created: []
  modified:
    - packages/core/src/repo/git-context.ts
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/init.test.ts
key-decisions:
  - "Kept `getGitContext()` read-only and moved `git init --quiet` into a separate shared helper."
  - "Reran init preflight after git bootstrap so scaffold and callers consume actual repository state instead of bootstrap permission."
patterns-established:
  - "Non-git init remains preflight-first: report state, decide if bootstrap is allowed, then mutate."
  - "Command-level tests must assert both disk mutations and user-facing output for bootstrap-sensitive flows."
requirements-completed: [BOOT-02]
duration: 3 min
completed: 2026-03-30
---

# Phase 01 Plan 04: Init Git Bootstrap Summary

**Non-git init now bootstraps a real repository before `.agent-badge` scaffold writes and returns refreshed git state**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T09:39:40Z
- **Completed:** 2026-03-30T09:42:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added a shared core helper that performs `git init --quiet` without making `getGitContext()` itself mutating.
- Updated `runInitCommand()` to bootstrap git only after successful preflight, rerun preflight immediately after bootstrap, and stop before scaffold writes if bootstrap fails.
- Locked the behavior with end-to-end tests that cover both the allowed bootstrap path and the blocked non-git path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shared git bootstrap and rerun preflight before scaffold** - `86de9ef` (`feat`)
2. **Task 2: Lock in non-git bootstrap regression coverage** - `0fc8db6` (`test`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified
- `packages/core/src/repo/git-context.ts` - exports the shared git bootstrap helper while keeping git-context inspection non-mutating.
- `packages/agent-badge/src/commands/init.ts` - bootstraps git before scaffold, refreshes preflight, and prints explicit bootstrap status.
- `packages/agent-badge/src/commands/init.test.ts` - verifies `.git` creation on the allowed path and no `.git` or `.agent-badge` mutation on the blocked path.

## Decisions Made
- Kept bootstrap logic in `@agent-badge/core` so future init entrypoints reuse one git-mutation path.
- Treated a post-bootstrap non-repo state as a hard stop before scaffolding, which preserves the plan’s safety requirement.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

BOOT-02 is now closed at the init command boundary and backed by regression coverage.

Phase 01 still has one open verification gap: `01-05` must add repo-local runtime dependency, script, and hook wiring to close BOOT-03 and return the phase to a truthful complete state.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/01-workspace-and-init-foundation/01-04-SUMMARY.md`.
- Verified task commit `86de9ef` exists in git history.
- Verified task commit `0fc8db6` exists in git history.
