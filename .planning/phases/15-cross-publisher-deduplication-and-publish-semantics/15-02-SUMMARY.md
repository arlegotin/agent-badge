---
phase: 15-cross-publisher-deduplication-and-publish-semantics
plan: 02
subsystem: publish
tags: [shared-state, deduplication, publish-service, init, refresh, vitest]
requires:
  - phase: 15-cross-publisher-deduplication-and-publish-semantics
    provides: schema-version-2 contributor observation records, canonical reducers, and refresh-cache v2 observation persistence
provides:
  - shared publish-service wiring that derives authoritative badge totals from publisher observation maps
  - command parity between full publish, refresh publish, and init first-publish flows
  - convergence regressions for duplicate sessions, canonical watermark winners, and zero-usage combined badges
affects: [phase-15, phase-16, publish-service, publish, refresh, init, shared-publish]
tech-stack:
  added: []
  patterns: [authoritative shared aggregation from observation maps, command-parity shared publish inputs, zero-usage combined badge normalization]
key-files:
  created:
    - .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-02-SUMMARY.md
  modified:
    - packages/core/src/publish/publish-service.ts
    - packages/core/src/publish/publish-service.test.ts
    - packages/core/src/publish/shared-badge-aggregation.test.ts
    - packages/core/src/scan/incremental-refresh.ts
    - packages/core/src/scan/incremental-refresh.test.ts
    - packages/agent-badge/src/commands/publish.ts
    - packages/agent-badge/src/commands/publish.test.ts
    - packages/agent-badge/src/commands/refresh.ts
    - packages/agent-badge/src/commands/refresh.test.ts
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/init.test.ts
key-decisions:
  - "Authoritative shared totals are recomputed from contributor observation maps after forcibly merging the local publisher record, so read-after-write gist staleness cannot drop the just-published contributor."
  - "Init, full publish, and refresh now all build the same publisherObservations contract, so CLI entrypoint choice does not change shared badge totals or override convergence."
  - "Combined and cost badge modes normalize zero included usage to zero estimated cost at the publish boundary instead of treating empty usage as missing cost data."
patterns-established:
  - "Shared badge publishing derives repo totals from canonical observation winners instead of trusting any one local aggregate snapshot."
  - "Command-level regressions cover init and release-readiness flows whenever shared publish semantics change."
requirements-completed: [CONS-02, CONS-03]
duration: 25m 41s
completed: 2026-04-02
---

# Phase 15 Plan 02: Shared Publish Wiring And Convergence Summary

**Shared publish-service, publish, refresh, and init now converge on one observation-map contract with deterministic duplicate-session outcomes**

## Performance

- **Duration:** 25m 41s
- **Started:** 2026-04-02T04:56:29+02:00
- **Completed:** 2026-04-02T05:22:10+02:00
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Wired shared publish-service, `agent-badge publish`, and `agent-badge refresh` to the schema-version-2 observation-map contract so authoritative totals come from canonical session winners.
- Added convergence regressions for duplicate sessions, watermark tie-breakers, authoritative shared aggregation, and refresh/full-publish parity.
- Hardened init and release-readiness flows so combined-mode first publish succeeds even when there is zero included usage or the follow-up gist read is stale.

## Task Commits

Task 1 and Task 2 landed together because the wiring and convergence regressions were tightly coupled:

1. **Shared publish wiring plus convergence verification**: `1508207` (`feat`)

## Files Created/Modified
- `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-02-SUMMARY.md` - Records phase outcomes, decisions, and verification.
- `packages/core/src/publish/publish-service.ts` - Derives authoritative totals and overrides from merged contributor observations, including stale-read and zero-usage normalization.
- `packages/core/src/publish/publish-service.test.ts` - Covers schema-v2 writer behavior, stale gist reads, zero-usage combined badges, convergence, and duplicate-session aggregation.
- `packages/core/src/publish/shared-badge-aggregation.test.ts` - Verifies badge payload aggregation against canonical duplicate-session winners.
- `packages/core/src/scan/incremental-refresh.ts` - Preserves publishable shared observations and cost zeros for refresh-path parity.
- `packages/core/src/scan/incremental-refresh.test.ts` - Verifies refresh-path ambiguous-session promotion and shared publish parity.
- `packages/agent-badge/src/commands/publish.ts` - Builds one publisher observation map from full scan attribution instead of passing aggregate totals.
- `packages/agent-badge/src/commands/publish.test.ts` - Proves publish output remains aggregate-only while shared decisions converge.
- `packages/agent-badge/src/commands/refresh.ts` - Converts refresh cache entries into the same shared observation contract used by full publish.
- `packages/agent-badge/src/commands/refresh.test.ts` - Verifies refresh publish matches full publish for duplicate sessions.
- `packages/agent-badge/src/commands/init.ts` - Reuses shared observation publishing for first publish during init.
- `packages/agent-badge/src/commands/init.test.ts` - Covers published init state, README/snippet behavior, and idempotent reruns under the shared publish model.

## Decisions Made
- The shared publish path now treats the local contributor record as authoritative input immediately after upload, which protects deterministic aggregation from transient gist metadata lag.
- Empty shared usage in combined mode is rendered as `0 tokens | $0` rather than a publish failure, which keeps init and first-use repos consistent with the badge payload contract.
- Init verification remains part of shared publish semantics because first publish is a command-level integration point, not a separate special case.

## Deviations from Plan

None - plan executed as intended, with init and release-readiness regressions fixed as part of the planned command-parity verification work.

## Issues Encountered

- Init and release-readiness initially failed because combined mode treated zero included usage as missing cost data, and simplistic gist fixtures did not reflect the just-written contributor file on the immediate follow-up read. Both issues were resolved in `publish-service.ts` without weakening the command-level coverage.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 15 is complete. Phase 16 can now focus on migration and operator diagnostics on top of a deterministic shared publish model with command-level parity and release-readiness coverage already in place.

## Self-Check: PASSED
