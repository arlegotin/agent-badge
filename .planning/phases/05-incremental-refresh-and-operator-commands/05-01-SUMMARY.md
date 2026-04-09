---
phase: 05-incremental-refresh-and-operator-commands
plan: 01
subsystem: infra
tags: [incremental-refresh, publish, cache, cursors]
requires:
  - phase: 04-publish-and-readme-badge-integration
    provides: exact endpoint badge payload hashing and deterministic gist publishing
provides:
  - provider-owned incremental cursor contracts for Codex and Claude
  - aggregate-only derived session-index cache for refresh totals
  - exact-payload hash-aware publish skipping for agent-badge.json
affects: [05-02, 05-03, refresh, status, config]
tech-stack:
  added: []
  patterns: [provider-owned opaque cursors, aggregate-only session cache, exact payload hash skip checks]
key-files:
  created:
    - packages/core/src/scan/incremental-refresh.ts
    - packages/core/src/scan/incremental-refresh.test.ts
    - packages/core/src/scan/refresh-cache.ts
    - packages/core/src/scan/refresh-cache.test.ts
  modified:
    - packages/core/src/state/state-schema.ts
    - packages/core/src/state/state-schema.test.ts
    - packages/core/src/providers/codex/codex-adapter.ts
    - packages/core/src/providers/claude/claude-adapter.ts
    - packages/core/src/scan/index.ts
    - packages/core/src/index.ts
    - packages/core/src/publish/publish-service.ts
    - packages/core/src/publish/publish-service.test.ts
    - packages/core/src/publish/index.ts
key-decisions:
  - "Provider checkpoints now use opaque per-session digest maps keyed by stable providerSessionId values instead of lastScannedAt-derived semantics."
  - "Refresh totals are derived from a local session-index cache that stores only stable keys plus aggregate contributions."
  - "Publish skipping compares the exact serialized endpoint payload hash and leaves lastPublishedAt unchanged when a write is skipped."
patterns-established:
  - "Incremental refresh: reuse the derived cache plus changed-session re-attribution instead of rerunning a full historical scan once checkpoints are valid."
  - "Publish diffing: hash JSON.stringify(buildEndpointBadgePayload(...), null, 2) + newline before deciding whether to update the Gist."
requirements-completed: [SCAN-04, PUBL-05, OPER-03]
duration: 13min
completed: 2026-03-30
---

# Phase 05 Plan 01: Incremental Refresh Contract Summary

**Provider-owned session cursors, an aggregate-only session-index cache, and exact-payload hash skipping now define the Phase 5 refresh/publish contract**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-30T17:51:41Z
- **Completed:** 2026-03-30T18:05:04Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Added `state.refresh` summary fields plus `publish.lastPublishedAt` so later operator commands can report the last refresh and publish outcomes without a historical rescan.
- Introduced a derived `.agent-badge/cache/session-index.json` cache that stores only stable session keys, refresh status, and aggregate contributions.
- Added `runIncrementalRefresh()` plus provider incremental scan contracts for Codex and Claude, with fallback to full backfill only when `forceFull` is set or checkpoints/cache are unusable.
- Added `publishBadgeIfChanged()` so exact serialized badge payload hashes can skip unchanged remote writes safely while keeping `publishBadgeToGist()` compatible for existing callers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the refresh cache, refresh summary state, and provider incremental scan contract** - `746e8eb` (feat)
2. **Task 2: Add a hash-aware publish helper that can skip unchanged badge uploads** - `da9970d` (feat)

**Plan metadata:** created in the final `docs(05-01)` commit for this plan

## Files Created/Modified
- `packages/core/src/scan/incremental-refresh.ts` - Core incremental refresh orchestration with cache merge and full-scan fallback rules.
- `packages/core/src/scan/refresh-cache.ts` - Aggregate-only session-index cache schema plus read/write helpers.
- `packages/core/src/state/state-schema.ts` - Refresh summary state and publish timestamp fields.
- `packages/core/src/providers/codex/codex-adapter.ts` - Provider-owned Codex cursor digests and incremental scan contract.
- `packages/core/src/providers/claude/claude-adapter.ts` - Provider-owned Claude cursor digests and incremental scan contract.
- `packages/core/src/publish/publish-service.ts` - Exact-payload hash-aware publish helper and wrapper preservation.
- `packages/core/src/publish/publish-service.test.ts` - Coverage for unchanged-hash skips and label-driven publishes.

## Decisions Made
- Provider cursors stay opaque and provider-owned by serializing per-session digests keyed only by stable provider session ids.
- The refresh cache stores only `provider`, `providerSessionId`, `updatedAt`, `status`, `includedSessions`, and `includedTokens`, so it can drive totals without persisting cwd paths, filenames, or raw evidence.
- Publish skipping uses the exact serialized endpoint payload, including label and mode effects, instead of comparing totals alone.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm test -- --run ...` could not find `vitest` through the local `.bin` entrypoint in this environment, so verification used `node node_modules/vitest/vitest.mjs --run ...` instead.
- `git commit` hit a transient `.git/index.lock` race twice; the lock file was not present on inspection, and retrying the commits succeeded without repository cleanup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 now has the core refresh and publish contracts needed for `refresh`, `status`, and `config` command work in `05-02`.
- Provider checkpoints, refresh summaries, and skip decisions are all persisted in privacy-safe structures that later operator commands can read directly.
- Environment note: local verification is currently more reliable through `node node_modules/vitest/vitest.mjs --run ...` than through `npm test -- --run ...` on this machine.

---
*Phase: 05-incremental-refresh-and-operator-commands*
*Completed: 2026-03-30*

## Self-Check: PASSED

- Found `.planning/phases/05-incremental-refresh-and-operator-commands/05-01-SUMMARY.md`
- Found task commits `746e8eb` and `da9970d`
