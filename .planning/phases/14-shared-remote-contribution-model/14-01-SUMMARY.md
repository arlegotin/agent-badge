---
phase: 14-shared-remote-contribution-model
plan: 01
subsystem: publish
tags: [gist, publish, shared-state, zod, vitest]
requires:
  - phase: 13-production-release-closure
    provides: stable gist-backed badge publishing and release-proven publish surface
provides:
  - strict shared contributor and shared override public schemas
  - deterministic contributor gist filenames and opaque shared override digests
  - pure contributor replacement, totals derivation, and override merge helpers
affects: [phase-14, phase-15, publish-service, shared-publish]
tech-stack:
  added: []
  patterns: [strict zod remote file schemas, per-publisher gist records, pure shared merge helpers]
key-files:
  created:
    - packages/core/src/publish/shared-model.ts
    - packages/core/src/publish/shared-model.test.ts
    - packages/core/src/publish/shared-merge.ts
    - packages/core/src/publish/shared-merge.test.ts
  modified:
    - packages/core/src/publish/index.ts
key-decisions:
  - "Canonical shared Phase 14 state is one per-publisher contribution file plus one shared overrides file."
  - "Shared override keys are published only as sha256-prefixed digests of stable local session keys."
patterns-established:
  - "Shared remote files use strict Zod schemas with schemaVersion: 1 and no extra public fields."
  - "Shared merge helpers stay pure and limited to contributor-slot replacement and derived totals, leaving deduplication to Phase 15."
requirements-completed: [TEAM-01, TEAM-02, TEAM-03]
duration: 3m 21s
completed: 2026-04-01
---

# Phase 14 Plan 01: Shared Remote Contract Summary

**Per-publisher shared gist records, opaque shared override digests, and pure merge helpers for deterministic Phase 14 remote state**

## Performance

- **Duration:** 3m 21s
- **Started:** 2026-04-01T21:43:55Z
- **Completed:** 2026-04-01T21:47:16Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added strict public schemas for shared contributor records and shared override records.
- Added deterministic contributor gist filename helpers and privacy-safe override digests.
- Added pure merge helpers for contributor replacement, derived totals, and override overwrites.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add strict schemas and deterministic file helpers for per-publisher contributions and shared overrides**
   RED: `4b75bae` (`test`)
   GREEN: `e2bf36d` (`feat`)
2. **Task 2: Add deterministic merge and totals helpers for contributor-slot replacement**
   RED: `d34dc10` (`test`)
   GREEN: `d26a671` (`feat`)

## Files Created/Modified
- `packages/core/src/publish/shared-model.ts` - Defines the public shared contributor and override schemas plus filename/digest helpers.
- `packages/core/src/publish/shared-model.test.ts` - Covers deterministic filenames, opaque override keys, and privacy-safe schema strictness.
- `packages/core/src/publish/shared-merge.ts` - Implements pure contributor replacement, totals derivation, and override merge helpers.
- `packages/core/src/publish/shared-merge.test.ts` - Proves replacement, derived totals, null-cost behavior, and exact-key override overwrites.
- `packages/core/src/publish/index.ts` - Exports the new shared model and merge helpers.

## Decisions Made
- Per-publisher contribution files and one shared overrides file are the canonical Phase 14 remote contract; badge endpoint files remain derived render outputs.
- Shared override references are SHA-256 digests of local stable session keys so raw `provider:providerSessionId` values never appear in public gist content.
- Merge helpers intentionally stop at contributor-slot replacement and aggregate recomputation so Phase 15 can own cross-publisher deduplication.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Publish wiring can now load strict shared contributor and override records, update one publisher slot deterministically, and derive shared included totals without changing the stable badge endpoint contract. The remaining Phase 14 work is wiring local state and gist publish flows to these helpers.

## Self-Check: PASSED
