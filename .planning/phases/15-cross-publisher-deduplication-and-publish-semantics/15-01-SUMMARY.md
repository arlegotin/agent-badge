---
phase: 15-cross-publisher-deduplication-and-publish-semantics
plan: 01
subsystem: publish
tags: [shared-state, deduplication, refresh-cache, zod, vitest]
requires:
  - phase: 14-shared-remote-contribution-model
    provides: per-publisher shared gist slots and baseline shared publish helpers
provides:
  - schema-version-2 contributor observation records keyed by opaque digests
  - deterministic canonical reducers for shared included totals and shared overrides
  - refresh-cache v2 entries that preserve per-session publish observations and override intent
affects: [phase-15, publish-service, refresh, pre-push, shared-publish]
tech-stack:
  added: []
  patterns: [opaque session-observation records, canonical watermark reduction, cache-backed shared publish inputs]
key-files:
  created: []
  modified:
    - packages/core/src/publish/shared-model.ts
    - packages/core/src/publish/shared-model.test.ts
    - packages/core/src/publish/shared-merge.ts
    - packages/core/src/publish/shared-merge.test.ts
    - packages/core/src/publish/index.ts
    - packages/core/src/scan/refresh-cache.ts
    - packages/core/src/scan/refresh-cache.test.ts
    - packages/core/src/scan/incremental-refresh.ts
    - packages/core/src/scan/incremental-refresh.test.ts
key-decisions:
  - "Shared contributor files now publish one opaque observation per stable session digest instead of totals-only snapshots."
  - "Canonical duplicate reduction uses sessionUpdatedAt, then tokens, then non-null cost, then lexicographically smallest publisherId."
  - "Incremental refresh cache keeps per-session status, overrideDecision, tokens, and optional cost so shared publish can reuse cached observations."
patterns-established:
  - "Shared publish state is session-centric and aggregate-only: raw provider session identifiers never leave the machine."
  - "Refresh summaries derive included totals from cached session observations instead of persisted included-only counters."
requirements-completed: [CONS-01, CONS-02, CONS-03]
duration: 5m 13s
completed: 2026-04-02
---

# Phase 15 Plan 01: Shared Observation Foundation Summary

**Schema-version-2 shared observation records, canonical duplicate-session reducers, and cache-backed publish observations for shared publish**

## Performance

- **Duration:** 5m 13s
- **Started:** 2026-04-02T04:51:16+02:00
- **Completed:** 2026-04-02T04:56:29+02:00
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Replaced totals-only contributor records with strict schema-version-2 observation maps keyed by opaque digests.
- Added deterministic shared reducers that collapse duplicate sessions once and derive shared override outcomes order-independently.
- Upgraded refresh cache persistence so incremental publish can rebuild shared observations, including ambiguous-session tokens and override intent, without forcing a full rescan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace totals-only contributor files with schema-version-2 session observation records and deterministic reducers**
   RED: `c9912e5` (`test`)
   GREEN: `f559b0a` (`feat`)
2. **Task 2: Extend refresh cache and incremental refresh to persist publishable per-session observations**
   GREEN: `fda6314` (`feat`)

## Files Created/Modified
- `packages/core/src/publish/shared-model.ts` - Defines schema-version-2 shared contributor observations keyed by opaque digests.
- `packages/core/src/publish/shared-model.test.ts` - Proves schema-version-2 parsing and rejects raw session identifiers in public records.
- `packages/core/src/publish/shared-merge.ts` - Adds canonical watermark comparison, duplicate-session reduction, and shared override derivation.
- `packages/core/src/publish/shared-merge.test.ts` - Verifies deterministic duplicate reduction and order-independent shared include/exclude resolution.
- `packages/core/src/publish/index.ts` - Explicitly exports the new shared reducer helpers.
- `packages/core/src/scan/refresh-cache.ts` - Upgrades refresh cache entries to session-level publish observations with override intent.
- `packages/core/src/scan/refresh-cache.test.ts` - Covers cache v2 persistence and ambiguous-session token retention.
- `packages/core/src/scan/incremental-refresh.ts` - Persists override-aware session observations and derives refresh summaries from included cache entries.
- `packages/core/src/scan/incremental-refresh.test.ts` - Covers ambiguous-session merge behavior, override persistence, and full-refresh fallback against cache v2.

## Decisions Made
- Shared contributor payloads now treat one session digest as the merge unit, which eliminates publish-order dependence from duplicate-session totals.
- Refresh cache v2 stores actual session tokens for ambiguous and excluded sessions so later shared publish logic can compare canonical winners without re-reading raw histories.
- Local explicit overrides are copied into cache observations, keeping refresh and later publish flows aligned on the same shared decision inputs.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Publish-service and both CLI entrypoints can now be rewired onto a stable observation-map contract instead of includedTotals. Wave 2 can focus on service/command wiring and convergence regressions without reopening cache shape or duplicate-session semantics.

## Self-Check: PASSED
