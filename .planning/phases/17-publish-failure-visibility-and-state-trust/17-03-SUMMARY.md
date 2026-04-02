---
phase: 17-publish-failure-visibility-and-state-trust
plan: 03
subsystem: diagnostics
tags: [publish, trust, diagnostics, doctor, vitest]
requires:
  - phase: 17-02
    provides: canonical persisted publish-attempt diagnostics and candidate-hash badge-change facts
provides:
  - canonical live badge trust derivation from persisted publish-attempt facts
  - doctor checks that report live badge trust separately from shared-health
  - one shared live-badge trust vocabulary across status, refresh, and doctor
affects: [status, refresh, doctor, diagnostics]
tech-stack:
  added: []
  patterns:
    - derive live badge trust from persisted publish-attempt facts instead of command-local heuristics
    - keep live badge trust distinct from shared publish health in diagnostics and CLI output
key-files:
  created: []
  modified:
    - packages/core/src/publish/publish-trust.ts
    - packages/core/src/publish/publish-trust.test.ts
    - packages/core/src/diagnostics/doctor.ts
    - packages/core/src/diagnostics/doctor.test.ts
    - packages/agent-badge/src/commands/status.test.ts
    - packages/agent-badge/src/commands/refresh.test.ts
    - packages/agent-badge/src/commands/doctor.test.ts
key-decisions:
  - "Publish trust now derives from persisted attempt outcome, candidate hash, and last successful sync facts rather than refresh-time heuristics."
  - "Doctor owns a dedicated `publish-trust` check so badge trust stays separate from shared-mode health and recovery guidance."
patterns-established:
  - "Canonical trust vocabulary pattern: status, refresh, and doctor render the same live-badge trust wording from one core helper."
  - "Failed publish classification pattern: distinguish stale failed publishes from failed-but-unchanged badge state without remote diff inspection."
requirements-completed: [OPER-01, OPER-02]
duration: 9 min
completed: 2026-04-02
---

# Phase 17 Plan 03: Canonical Publish Trust Diagnostics Summary

**Canonical live-badge trust derivation plus doctor diagnostics that distinguish stale failed publishes from failed-but-unchanged badge state**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-02T08:14:54Z
- **Completed:** 2026-04-02T08:24:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Replaced the Phase 17-01 heuristic trust logic with a canonical report derived from persisted attempt outcome, candidate-hash, and successful-sync facts.
- Added a dedicated `publish-trust` doctor check that reuses the same live-badge trust report without overloading shared-health.
- Locked one operator vocabulary across status, refresh, and doctor, including the failed-but-unchanged badge case.

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade publish-trust to use canonical persisted attempt facts instead of coarse heuristics** - `f2b16c4` (feat)
2. **Task 2: Reuse the canonical publish-trust report across status, refresh, and doctor without overloading shared-health** - `753e485` (feat)

## Files Created/Modified

- `packages/core/src/publish/publish-trust.ts` - Canonical trust derivation and shared wording for current, unchanged, stale, failed-but-unchanged, and unknown states.
- `packages/core/src/publish/publish-trust.test.ts` - Coverage for changed-vs-unchanged failed publishes and incomplete persisted diagnostics.
- `packages/core/src/diagnostics/doctor.ts` - Dedicated `publish-trust` check and remediation guidance derived from the canonical trust report.
- `packages/core/src/diagnostics/doctor.test.ts` - Regression coverage for publish-trust checks without collapsing into shared-health semantics.
- `packages/agent-badge/src/commands/status.test.ts` - Status output coverage for stale and failed-but-unchanged live badge trust wording.
- `packages/agent-badge/src/commands/refresh.test.ts` - Refresh output coverage for the same canonical trust vocabulary.
- `packages/agent-badge/src/commands/doctor.test.ts` - Doctor command rendering coverage for the shared publish-trust messaging.

## Decisions Made

- Kept trust classification purely state-derived so operator output does not depend on remote inspection beyond the canonical persisted publish facts.
- Added doctor remediation at the publish-trust layer rather than expanding shared-health, preserving the conceptual boundary between badge freshness and shared contributor health.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 17 now has one canonical, privacy-safe live badge trust model across operator surfaces.
- Phase completion verification can focus on workflow alignment and requirement coverage rather than command-specific trust heuristics.

## Self-Check: PASSED

- Found task commits `f2b16c4` and `753e485`
- Phase-touched tests for publish trust, doctor diagnostics, and command rendering were updated with canonical trust vocabulary
