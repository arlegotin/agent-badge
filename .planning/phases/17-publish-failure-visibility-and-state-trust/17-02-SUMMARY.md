---
phase: 17-publish-failure-visibility-and-state-trust
plan: 02
subsystem: publish
tags: [publish, state, diagnostics, gist, zod]
requires:
  - phase: 17-01
    provides: live badge trust reporting in refresh and status that now consumes canonical persisted attempt facts
provides:
  - additive publish-attempt diagnostics in `.agent-badge/state.json`
  - candidate-hash and changed-badge metadata from the shared publish flow
  - init-safe reconciliation that preserves Phase 17 publish diagnostics on rerun
affects: [17-03, status, doctor, refresh]
tech-stack:
  added: []
  patterns: [privacy-safe persisted publish diagnostics, structured publish failure metadata, shared publish attempt state helpers]
key-files:
  created: []
  modified:
    - packages/core/src/state/state-schema.ts
    - packages/core/src/publish/publish-service.ts
    - packages/core/src/publish/publish-state.ts
    - packages/core/src/init/scaffold.ts
    - packages/agent-badge/src/commands/publish.ts
    - packages/agent-badge/src/commands/refresh.ts
key-decisions:
  - "Persist publish-attempt facts as additive schema defaults so old state files still parse and init reruns cannot strip trust diagnostics."
  - "Return candidateHash and changedBadge from the core publish flow and wrap failures in PublishBadgeError so commands can persist failure-safe diagnostics without storing raw error text."
patterns-established:
  - "Publish attempt persistence is owned by shared core helpers instead of ad-hoc command mutations."
  - "Unchanged remote syncs advance `lastSuccessfulSyncAt` while preserving `lastPublishedAt` as the last visible badge change."
requirements-completed: [OPER-01, OPER-02]
duration: 12 min
completed: 2026-04-02
---

# Phase 17 Plan 02: Persist Canonical Publish Failure Diagnostics And Attempt Facts Summary

**Additive publish-attempt state fields, candidate-hash publish metadata, and failure-safe command persistence for changed, unchanged, failed, and not-attempted badge outcomes**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-02T07:56:47Z
- **Completed:** 2026-04-02T08:08:47Z
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments
- Added canonical Phase 17 publish-attempt fields to persisted state with migration-safe defaults and strict privacy-safe enums.
- Computed candidate badge hashes before remote writes and returned changed-badge facts from the shared publish flow for both published and unchanged outcomes.
- Aligned `publish` and `refresh` to persist the same attempt contract on success, unchanged syncs, not-configured/deferred decisions, and failures without storing raw error messages.
- Preserved the new diagnostics through init scaffold reconciliation so rerunning init does not downgrade `.agent-badge/state.json`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Persist canonical publish-attempt diagnostics in state and populate them from every publish write path** - `75c7d77` (feat)

## Files Created/Modified
- `packages/core/src/state/state-schema.ts` - Adds the canonical publish-attempt diagnostics schema and defaults.
- `packages/core/src/state/state-schema.test.ts` - Covers additive parsing and privacy-safe persisted diagnostics.
- `packages/core/src/publish/publish-service.ts` - Computes candidate hashes before writes, records changed-badge facts, and wraps failures with structured diagnostics.
- `packages/core/src/publish/publish-state.ts` - Centralizes success, failure, and not-attempted publish persistence helpers for command reuse.
- `packages/core/src/publish/publish-service.test.ts` - Verifies candidate-hash behavior, unchanged sync semantics, and updated shared publish write expectations.
- `packages/core/src/init/scaffold.ts` - Preserves all new publish diagnostics during scaffold reconciliation.
- `packages/agent-badge/src/commands/publish.ts` - Persists canonical publish attempt diagnostics on success, not-configured runs, and failures.
- `packages/agent-badge/src/commands/refresh.ts` - Persists the same canonical publish attempt diagnostics across refresh publish outcomes.

## Decisions Made

- Persisted publish-attempt facts as durable state fields instead of storing time-relative trust conclusions, keeping later status/doctor derivation consistent.
- Treated unchanged badge syncs as successful attempts that update `lastSuccessfulSyncAt` while preserving `lastPublishedAt` for real visible badge changes only.
- Used `PublishBadgeError` to carry privacy-safe failure metadata so command state writes can capture failure classification and candidate-hash context without leaking raw error detail.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first implementation skipped contributor and overrides writes on unchanged publishes, which would have regressed shared-state synchronization. Restored those writes in `publishBadgeIfChanged()` and re-verified the targeted suite.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 17-03 can now replace heuristic trust reasoning with canonical persisted diagnostics across `status`, `refresh`, and `doctor`.
- The persisted state now distinguishes published, unchanged, failed, deferred, and not-configured publish outcomes without leaking private detail.

## Self-Check: PASSED

- Found `.planning/phases/17-publish-failure-visibility-and-state-trust/17-02-SUMMARY.md`
- Found task commit `75c7d77`
