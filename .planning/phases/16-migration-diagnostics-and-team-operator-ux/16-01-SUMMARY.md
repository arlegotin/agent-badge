---
phase: 16-migration-diagnostics-and-team-operator-ux
plan: 01
subsystem: cli
tags: [migration, diagnostics, gist, vitest, shared-publish]
requires:
  - phase: 15-cross-publisher-deduplication-and-publish-semantics
    provides: deterministic shared contributor writes and badge payload derivation
provides:
  - canonical shared-health inspection for legacy and shared gist state
  - explicit publish migration results with pre/post health snapshots
  - consistent shared publish mode and migration summaries in init, publish, and refresh
affects: [status, doctor, docs, phase-16-02]
tech-stack:
  added: []
  patterns: [typed shared-health reports, pre/post publish inspection, command-level migration summaries]
key-files:
  created:
    - packages/core/src/publish/shared-health.ts
    - packages/core/src/publish/shared-health.test.ts
  modified:
    - packages/core/src/publish/publish-service.ts
    - packages/core/src/publish/publish-service.test.ts
    - packages/core/src/publish/index.ts
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/init.test.ts
    - packages/agent-badge/src/commands/publish.ts
    - packages/agent-badge/src/commands/publish.test.ts
    - packages/agent-badge/src/commands/refresh.ts
    - packages/agent-badge/src/commands/refresh.test.ts
key-decisions:
  - "Shared publish health is one typed core report reused by publish flows instead of command-specific migration heuristics."
  - "Migration is explicit only when the pre-write gist is legacy and the post-write authoritative shared view is shared on the same gist id."
patterns-established:
  - "Publish result pattern: return state plus healthBeforePublish, healthAfterPublish, and migrationPerformed from core services."
  - "Operator summary pattern: init, publish, and refresh print the same Publish mode and Migration lines after shared publish work."
requirements-completed: [MIGR-01, MIGR-02]
duration: 12 min
completed: 2026-04-02
---

# Phase 16 Plan 01: Migration And Shared Publish Foundation Summary

**Typed shared-health inspection with explicit legacy-to-shared migration results surfaced through init, publish, and refresh**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-02T04:27:00Z
- **Completed:** 2026-04-02T04:38:44Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added `inspectSharedPublishHealth()` with typed mode, status, issue ids, stale detection, orphan detection, and conflict counting for shared contributor observations.
- Extended shared publish results to include `healthBeforePublish`, `healthAfterPublish`, and `migrationPerformed` without rotating gist ids or badge payload filenames.
- Unified init, publish, and refresh output around the same privacy-safe shared publish summary contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a canonical shared-health inspection layer for legacy, stale, conflicting, partial, and orphaned publish states** - `169f541` (feat)
2. **Task 2: Wire init, publish, and refresh through the shared-health report and explicit legacy-to-shared migration result** - `957fa03` (feat)

Plan metadata commit recorded separately after summary/state updates.

## Files Created/Modified

- `packages/core/src/publish/shared-health.ts` - canonical remote/local shared publish health inspection and shared gist parsing
- `packages/core/src/publish/shared-health.test.ts` - regression coverage for legacy, healthy, orphaned, stale, and conflicting shared states
- `packages/core/src/publish/publish-service.ts` - shared publish result enrichment with pre/post health and migration detection
- `packages/core/src/publish/publish-service.test.ts` - migration and stable-gist publish result coverage
- `packages/agent-badge/src/commands/init.ts` - init output wiring for shared publish mode and migration summary
- `packages/agent-badge/src/commands/publish.ts` - publish command summary wiring for shared migration results
- `packages/agent-badge/src/commands/refresh.ts` - refresh summary wiring for shared migration results

## Decisions Made

- Used the shared-health module as the single classifier for both legacy and shared gist state so later operator surfaces can reuse the exact same contract.
- Computed post-publish health from the authoritative contributor set plus derived overrides on the existing gist target, which keeps badge URLs stable during migration.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Existing command tests mocked the old publish return shape, so they were updated to exercise the new migration contract rather than masking it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 16-02 can now reuse the shared-health report in `status`, `doctor`, and docs without inventing a second migration model.
- No functional blockers remain for team-operator diagnostics and documentation work.

## Self-Check: PASSED
