---
phase: 03-historical-backfill-and-attribution-review
plan: 03
subsystem: cli
tags: [scan, cli, overrides, vitest, privacy]
requires:
  - phase: 03-01
    provides: full historical backfill service with privacy-safe attribution hints
  - phase: 03-02
    provides: deterministic attribution engine plus stable ambiguous-session overrides
provides:
  - privacy-safe scan report formatting with included, ambiguous, and excluded sections
  - completed-scan state writeback that preserves cursors and reuses ambiguous-session decisions
  - runtime `scan` command coverage for report output, override reuse, and failed-scan safety
affects: [phase-03-scan-reporting, runtime-cli, completed-scan-state]
tech-stack:
  added: []
  patterns:
    - scan command orchestration lives in `packages/agent-badge/src/commands/scan.ts` and keeps state writes after the full scan and report path succeeds
    - operator-facing scan output explains attribution evidence with stable session keys instead of raw local paths or transcript details
key-files:
  created:
    - packages/core/src/scan/scan-report.ts
    - packages/core/src/scan/scan-report.test.ts
    - packages/core/src/scan/scan-state.ts
    - packages/agent-badge/src/commands/scan.ts
    - packages/agent-badge/src/commands/scan.test.ts
  modified:
    - packages/core/src/scan/index.ts
    - packages/core/src/index.ts
    - packages/agent-badge/src/cli/main.ts
key-decisions:
  - "The scan report prints stable `provider:providerSessionId` keys, evidence kinds, and reason strings, but never raw cwd realpaths or transcript paths."
  - "Completed-scan state updates only advance `lastScannedAt` for providers scanned successfully and preserve existing cursors unless a concrete cursor is supplied."
  - "Explicit include/exclude session keys are applied only when the current scan still marks that session ambiguous; invalid override requests warn without mutating state."
patterns-established:
  - "CLI scan tests exercise the full command path with temp repo fixtures instead of mocking the report formatter in isolation."
  - "State writeback helpers remain pure functions that apply checkpoint and override changes before the command persists `.agent-badge/state.json`."
requirements-completed: [ATTR-02, ATTR-05, SCAN-05]
duration: 9 min
completed: 2026-03-30
---

# Phase 03 Plan 03: Scan Command Summary

**Phase 3 now exposes a real `scan` command that reports included, ambiguous, and excluded sessions safely and persists completed-scan state only after success**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-30T15:45:45+02:00
- **Completed:** 2026-03-30T15:54:41+02:00
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added `formatScanReport()` with the required `Included Totals`, `Ambiguous Sessions`, and `Excluded Sessions` sections while keeping raw path evidence out of operator-facing output.
- Added `applyCompletedScanState()` plus `runScanCommand()` so the CLI can load config and state, run the Phase 3 backfill and attribution flow, apply explicit include/exclude overrides, print the report, and persist state only after success.
- Wired the `scan` command into Commander and added end-to-end command tests that prove section output, override reuse on later scans, and unchanged checkpoints after failed scans.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the scan report formatter with explicit redaction rules** - `e1b39b8` (`feat`)
2. **Task 2: Implement completed-scan state updates and the runtime scan command** - `879dfa1` (`feat`)
3. **Task 3: Wire `scan` into the CLI and prove SCAN-05 plus override reuse end to end** - `a0b97aa` (`test`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified

- `packages/core/src/scan/scan-report.ts` - formats the human-readable attribution report with explicit privacy-safe sections and evidence summaries.
- `packages/core/src/scan/scan-report.test.ts` - proves required headings and confirms raw placeholder paths do not appear in formatted output.
- `packages/core/src/scan/scan-state.ts` - applies conservative completed-scan checkpoint updates and persisted override decisions.
- `packages/agent-badge/src/commands/scan.ts` - orchestrates config/state loading, backfill, attribution, optional override application, report writing, and successful state persistence.
- `packages/agent-badge/src/commands/scan.test.ts` - covers CLI output sections, second-run override reuse, and failed-scan state safety.
- `packages/core/src/scan/index.ts`, `packages/core/src/index.ts`, and `packages/agent-badge/src/cli/main.ts` - export the new scan surfaces and register the runtime `scan` command with include/exclude session options.

## Decisions Made

- Report rows expose only stable session keys plus evidence kinds so developers can review attribution decisions without leaking local path details.
- Override requests only mutate state when the current scan still marks the session ambiguous, preventing stale manual keys from silently changing persisted data.
- The command writes `.agent-badge/state.json` only after report generation succeeds, which keeps failed scans from rewriting checkpoints or override state.

## Deviations from Plan

None - plan executed as written. The only manual follow-up was restoring this summary after the executor landed all three task commits but failed to write its final bookkeeping file.

## Issues Encountered

- The workspace still lacks local `tsc` and `vitest` binaries under `/Volumes/git`, so verification used `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH"` instead of reinstalling dependencies on the low-space volume.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 03 now provides the operator-facing scan contract and stable override reuse that Phase 04 can publish.

The next phase can consume included totals and aggregate badge data without adding more local attribution plumbing first.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/03-historical-backfill-and-attribution-review/03-03-SUMMARY.md`.
- Verified task commit `e1b39b8` exists in git history.
- Verified task commit `879dfa1` exists in git history.
- Verified task commit `a0b97aa` exists in git history.

---
*Phase: 03-historical-backfill-and-attribution-review*
*Completed: 2026-03-30*
