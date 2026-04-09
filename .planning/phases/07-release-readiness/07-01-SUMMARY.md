---
phase: 07-release-readiness
plan: 01
subsystem: testing
tags: [vitest, github-actions, node-matrix, release-readiness]
requires:
  - phase: 04-publish-and-readme-badge
    provides: init publish target handling, README badge insertion, gist publishing
  - phase: 05-incremental-refresh-and-ops
    provides: refresh/runtime wiring and fail-soft pre-push behavior
provides:
  - fixture-backed release-readiness scenario matrix for init behavior
  - CI baseline validating typecheck/build/tests on Node 20.x/22.x/24.x
  - explicit CI gate for the release-readiness matrix test file
affects: [release gating, ci, phase-07-plan-02, phase-07-plan-03]
tech-stack:
  added: []
  patterns:
    - table-driven init scenario verification with deterministic gist stubs
    - isolated CI HOME to avoid host-provider directory coupling
key-files:
  created:
    - packages/agent-badge/src/commands/release-readiness-matrix.test.ts
    - .github/workflows/ci.yml
  modified: []
key-decisions:
  - "Release-readiness proof is a dedicated matrix test file rather than implicit coverage spread across multiple tests."
  - "CI runs a separate scenario-matrix job so REL-01 remains an explicit release gate."
patterns-established:
  - "Matrix scenarios must pass explicit homeRoot fixtures so tests never touch ~/.codex or ~/.claude."
  - "Workflow jobs set HOME to runner.temp and create it before test execution."
requirements-completed: [REL-01, REL-02]
duration: 5min
completed: 2026-03-31
---

# Phase 07 Plan 01: Release-Readiness Matrix and CI Summary

**REL-01 and REL-02 now have objective evidence through a dedicated init scenario matrix test harness and a Node-versioned CI workflow with an explicit matrix gate.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T08:57:29Z
- **Completed:** 2026-03-31T09:02:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `describe("release readiness scenario matrix", ...)` with fixture-backed coverage for `fresh-repo`, `existing-repo-rerun`, `providers-codex-only`, `providers-claude-only`, `providers-both`, `no-readme`, `no-origin`, `no-auth`, and `idempotent-reinit`.
- Added deterministic gist client stubs (`getGist`, `createPublicGist`, `updateGistFile`, `deleteGist`) and per-scenario assertions for publish status, README marker count, hook marker count, and no-README creation behavior.
- Added `.github/workflows/ci.yml` with a Node 20.x/22.x/24.x validate matrix and an explicit `scenario-matrix` gate that runs the release-readiness matrix test file on Node 24.x.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add explicit release-readiness scenario matrix tests for REL-01** - `e9ad8a3` (test)
2. **Task 2: Create baseline Node-matrix CI workflow with explicit scenario gate (REL-02)** - `980d781` (feat)

**Plan metadata:** pending (added in final docs commit)

## Files Created/Modified
- `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` - Table-driven init scenario matrix with fixture-only provider homes and deterministic gist stubs.
- `.github/workflows/ci.yml` - CI workflow with validate matrix and explicit release-readiness matrix gate.

## Decisions Made
- Added a standalone release-readiness matrix suite so REL-01 remains auditable and runnable as a single command.
- Separated `scenario-matrix` into its own CI job to keep release gating explicit instead of relying on incidental test coverage.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 07-01 deliverables are complete and verifiable; phase now has CI baseline plus explicit REL-01 gate.
- Remaining phase work is isolated to release automation and docs/smoke packaging tasks in plans 07-02 and 07-03.

---
*Phase: 07-release-readiness*
*Completed: 2026-03-31*

## Self-Check: PASSED
- FOUND: packages/agent-badge/src/commands/release-readiness-matrix.test.ts
- FOUND: .github/workflows/ci.yml
- FOUND: .planning/phases/07-release-readiness/07-01-SUMMARY.md
- FOUND: e9ad8a3
- FOUND: 980d781
