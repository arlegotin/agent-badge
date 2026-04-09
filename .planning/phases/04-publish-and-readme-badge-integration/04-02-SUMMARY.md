---
phase: 04-publish-and-readme-badge-integration
plan: 02
subsystem: cli
tags: [shields, github-gist, publish, cli, vitest]
requires:
  - phase: 04-01
    provides: stable gist identity, publish config/state seams, and deterministic `agent-badge.json` targeting
  - phase: 03-03
    provides: full backfill plus attribution pipeline and persisted override reuse
provides:
  - aggregate-only Shields endpoint payload serialization for sessions and tokens
  - core gist publish orchestration with deterministic content hashing
  - first-class `agent-badge publish` command wired to scan plus attribution
affects: [phase-04-readme-badge, phase-05-refresh, cli, gist-publishing]
tech-stack:
  added: []
  patterns:
    - publish payloads are serialized as exactly `schemaVersion`, `label`, `message`, and `color`, then hashed from the final pretty-printed JSON
    - the publish command reuses full backfill plus attribution directly and persists only publish-state changes instead of piggybacking on scan reporting side effects
key-files:
  created:
    - packages/core/src/publish/badge-payload.ts
    - packages/core/src/publish/badge-payload.test.ts
    - packages/core/src/publish/publish-service.ts
    - packages/core/src/publish/publish-service.test.ts
    - packages/agent-badge/src/commands/publish.ts
    - packages/agent-badge/src/commands/publish.test.ts
  modified:
    - packages/core/src/publish/index.ts
    - packages/agent-badge/src/cli/main.ts
    - packages/agent-badge/src/cli/main.test.ts
    - packages/agent-badge/src/index.ts
key-decisions:
  - "The core publish service hashes the exact pretty-printed endpoint JSON it uploads so later skip-if-unchanged logic can compare the real remote payload content."
  - "The publish command reuses `runFullBackfillScan()` and `attributeBackfillSessions()` directly and only persists publish status/hash updates, leaving scan checkpoint mutation to the dedicated scan flow."
patterns-established:
  - "Aggregate-only publish tests assert the serialized gist payload omits provider session ids, cwd values, and attribution reason strings."
  - "Command tests inject mocked scan, attribution, and publish services through the `@agent-badge/core` module boundary instead of depending on live provider data or network calls."
requirements-completed: [PUBL-03]
duration: 6 min
completed: 2026-03-30
---

# Phase 04 Plan 02: Publish Command Summary

**Aggregate-only Shields endpoint serialization with deterministic gist hashing and a first-class `agent-badge publish` command**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-30T18:08:41+02:00
- **Completed:** 2026-03-30T18:14:51+02:00
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added a core badge payload serializer that emits exactly the supported Shields endpoint fields and fails explicitly for unsupported `cost` mode.
- Added a core gist publish service that derives included totals from attributed sessions, overwrites the deterministic `agent-badge.json` file, and stores `lastPublishedHash` from the exact uploaded JSON.
- Added `agent-badge publish`, wired it to full backfill plus attribution, persisted publish status updates, and exposed the command through the CLI and package exports.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the aggregate-only Shields endpoint payload and core publish service** - `fea4643` (`feat`)
2. **Task 2: Add the `publish` command and wire it to the existing scan plus attribution pipeline** - `cd23d3e` (`feat`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified

- `packages/core/src/publish/badge-payload.ts` and `packages/core/src/publish/badge-payload.test.ts` - serialize the supported endpoint JSON and cover sessions, tokens, zero-state color, and unsupported cost mode.
- `packages/core/src/publish/publish-service.ts` and `packages/core/src/publish/publish-service.test.ts` - publish deterministic gist content, hash the exact payload body, and prove aggregate-only serialization.
- `packages/core/src/publish/index.ts` - exports the new payload and publish-service modules.
- `packages/agent-badge/src/commands/publish.ts` and `packages/agent-badge/src/commands/publish.test.ts` - add the publish command flow, config/state persistence, and fixture-backed regression coverage.
- `packages/agent-badge/src/cli/main.ts`, `packages/agent-badge/src/cli/main.test.ts`, and `packages/agent-badge/src/index.ts` - register and export the publish command from the runtime CLI surface.

## Decisions Made

- The publish payload remains four-field, aggregate-only JSON even in tests, so any leak of provider/session evidence becomes an immediate regression.
- `publish` does not call `runScanCommand()`; it reruns scan plus attribution internally so publish-side effects stay separate from scan reporting and override workflows.
- The command requires both configured `gistId` and stable `badgeUrl` before publishing, which keeps partial or deferred init state from attempting a broken remote update.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused the existing `/tmp/agent-badge-deps` Vitest binary path for verification**
- **Found during:** Task 1 verification
- **Issue:** The workspace `node_modules/.bin` did not expose `vitest`, and the repo's low-space volume constraint made a fresh local dependency install undesirable.
- **Fix:** Ran all plan verification commands with `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH"` so the existing dependency cache could satisfy the test runner.
- **Files modified:** None
- **Verification:** Targeted publish tests passed and the full `npm test -- --run` suite passed through the same PATH override.
- **Committed in:** Not applicable (verification environment only)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No product-scope change. The deviation only affected how verification ran on this machine.

## Issues Encountered

- The workspace still relies on the existing `/tmp/agent-badge-deps` dependency cache for `vitest` execution. This did not affect code behavior, but verification commands must continue using that PATH override on the current machine until the workspace-local toolchain is repaired.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 04 now has a real publish path and deterministic remote payload contract, so the next plan can focus on README badge insertion and degraded no-README flows instead of remote JSON mechanics.

The remaining live validation gap is a real GitHub plus Shields smoke test, but there are no code blockers for the README integration work.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/04-publish-and-readme-badge-integration/04-02-SUMMARY.md`.
- Verified task commit `fea4643` exists in git history.
- Verified task commit `cd23d3e` exists in git history.

---
*Phase: 04-publish-and-readme-badge-integration*
*Completed: 2026-03-30*
