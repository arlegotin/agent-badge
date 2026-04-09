---
phase: 03-historical-backfill-and-attribution-review
plan: 01
subsystem: infra
tags: [attribution, scan, providers, vitest, repo-fingerprint]
requires:
  - phase: 02-03
    provides: normalized Codex and Claude session adapters plus shared session-summary schema
provides:
  - privacy-safe attribution hints on normalized provider summaries
  - full historical backfill service with enabled-provider scanning and composite-key dedupe
  - integration coverage for first-run backfill counts, lineage preservation, and transcript-text redaction
affects: [phase-03-attribution, scan-reporting, public-api]
tech-stack:
  added: []
  patterns:
    - backfill orchestration lives under `packages/core/src/scan` and returns repo, sessions, and per-provider counts together
    - normalized session summaries carry only local-only attribution hints, never transcript text or raw transcript paths
key-files:
  created:
    - packages/core/src/scan/full-backfill.ts
    - packages/core/src/scan/full-backfill.test.ts
    - packages/core/src/scan/index.ts
  modified:
    - packages/core/src/providers/session-summary.ts
    - packages/core/src/providers/codex/codex-adapter.ts
    - packages/core/src/providers/claude/claude-jsonl.ts
    - packages/core/src/providers/claude/claude-adapter.ts
    - packages/core/src/index.ts
key-decisions:
  - "Added `attributionHints` with only `cwdRealPath` and `transcriptProjectKey` so later attribution gains correlation seams without widening the privacy surface."
  - "Backfill counts track scanned and deduped totals per provider while preserving lineage metadata and leaving token arithmetic untouched."
  - "Claude transcript correlation uses the `.claude/projects` directory key instead of transcript text or persisted absolute paths."
patterns-established:
  - "Phase 3 scan services enrich provider summaries after adapter output instead of pushing repo-aware logic down into provider adapters."
  - "Backfill integration tests merge real provider fixtures into one temp home, then stub only the boundary under direct test."
requirements-completed: [ATTR-02]
duration: 7 min
completed: 2026-03-30
---

# Phase 03 Plan 01: Historical Backfill Summary

**Full historical backfill now scans enabled Codex and Claude providers into a deduped repo-scoped session inventory with privacy-safe attribution hints**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-30T13:21:03Z
- **Completed:** 2026-03-30T13:27:37Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Extended the shared normalized session schema so both providers emit only the local-only attribution hints Phase 3 needs next.
- Added `runFullBackfillScan()` under core scan services to resolve repo identity once, scan only enabled providers, realpath valid `cwd` values, and dedupe by `provider:providerSessionId`.
- Added integration coverage that proves composite-key dedupe, enabled-provider gating, preserved lineage, provider-separated counts, and absence of transcript text in serialized backfill results.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend normalized session summaries with attribution-ready local hints** - `06acd9f` (`feat`)
2. **Task 2: Build the full historical backfill service and export it from core** - `cf029ca` (`feat`)
3. **Task 3: Prove first-run backfill behavior with integration tests** - `ea83603` (`test`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified

- `packages/core/src/providers/session-summary.ts` - adds the strict `attributionHints` object to the normalized session schema.
- `packages/core/src/providers/codex/codex-adapter.ts` - threads null attribution hints through Codex summaries so later scan services can enrich them safely.
- `packages/core/src/providers/claude/claude-jsonl.ts` - derives a privacy-safe `projectKey` from the immediate directory beneath `.claude/projects/`.
- `packages/core/src/providers/claude/claude-adapter.ts` - maps Claude `projectKey` into `transcriptProjectKey` on normalized summaries.
- `packages/core/src/scan/full-backfill.ts` - implements the shared first-run backfill orchestration service and per-provider counts.
- `packages/core/src/scan/index.ts` and `packages/core/src/index.ts` - export the new scan surface from the core package.
- `packages/core/src/scan/full-backfill.test.ts` - covers first-run backfill behavior with real fixtures plus explicit dedupe-boundary stubbing.

## Decisions Made

- Kept attribution hints minimal and local-only so Phase 3 gains correlation seams without changing the aggregate-only privacy contract.
- Resolved `cwd` realpaths in the scan service, not the adapters, because repo-aware enrichment belongs after provider parsing.
- Counted both scanned and deduped sessions per provider so later attribution/reporting work can explain what backfill considered before any inclusion logic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The workspace does not have local `tsc` and `vitest` binaries available under `/Volumes/git`, so verification used `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH"` to run the planned `npm` commands without reinstalling dependencies on the low-space volume.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 03 now has the shared candidate inventory required for attribution work in `03-02`.

The next plan can score these deduped sessions using repo evidence, ambiguous-session handling, and persisted overrides without needing any new provider parsing primitives.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/03-historical-backfill-and-attribution-review/03-01-SUMMARY.md`.
- Verified task commit `06acd9f` exists in git history.
- Verified task commit `cf029ca` exists in git history.
- Verified task commit `ea83603` exists in git history.

---
*Phase: 03-historical-backfill-and-attribution-review*
*Completed: 2026-03-30*
