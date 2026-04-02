---
phase: 16-migration-diagnostics-and-team-operator-ux
plan: 02
subsystem: cli
tags: [diagnostics, docs, migration, status, doctor, vitest]
requires:
  - phase: 16-migration-diagnostics-and-team-operator-ux
    provides: canonical shared-health inspection and migration-aware shared publish results from plan 01
provides:
  - shared-mode status and doctor output backed by the canonical shared-health report
  - migration and recovery docs aligned with per-session shared observations
  - docs verification that locks shared migration terminology and recovery guidance
affects: [status, doctor, README, docs, operator-ux]
tech-stack:
  added: []
  patterns: [canonical shared-health reuse, privacy-safe issue summaries, docs-gated operator terminology]
key-files:
  created: []
  modified:
    - packages/core/src/diagnostics/doctor.ts
    - packages/core/src/diagnostics/doctor.test.ts
    - packages/agent-badge/src/commands/status.ts
    - packages/agent-badge/src/commands/status.test.ts
    - packages/agent-badge/src/commands/doctor.test.ts
    - README.md
    - docs/HOW-IT-WORKS.md
    - docs/PRIVACY.md
    - docs/TROUBLESHOOTING.md
    - docs/MANUAL-GIST.md
    - scripts/verify-docs.sh
key-decisions:
  - "Status and doctor both consume inspectSharedPublishHealth() so operator mode and health vocabulary cannot drift between commands."
  - "Migration docs explicitly direct legacy repos back to the original publisher machine because the old badge payload is not a lossless history source."
patterns-established:
  - "Operator summary pattern: status prints one Shared mode line plus privacy-safe Shared issues counts from the canonical report."
  - "Recovery-doc pattern: shared stale/conflict/partial/orphaned guidance is mirrored in docs and enforced by scripts/verify-docs.sh."
requirements-completed: [MIGR-02, MIGR-03]
duration: 9 min
completed: 2026-04-02
---

# Phase 16 Plan 02: Operator Shared Health UX Summary

**Shared-health-aware status and doctor output with migration-safe operator docs and enforced shared observation terminology**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-02T04:42:22Z
- **Completed:** 2026-04-02T04:51:24Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Extended `status` with canonical shared mode, health, contributor counts, and privacy-safe shared issue summaries.
- Added `shared-mode` and `shared-health` doctor checks that reuse the core shared-health classifier and give explicit refresh/init remediation.
- Updated README and operator docs to describe per-session shared observations, original-machine migration, and stale/conflict/partial/orphaned recovery flows, then locked that language in `scripts/verify-docs.sh`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Surface shared mode and shared-health clearly in status and doctor** - `7d4b6ee` (feat)
2. **Task 2: Update docs and docs checks for migration, shared observations, and recovery guidance** - `580b53b` (feat)

Plan metadata commit recorded separately after summary/state updates.

## Files Created/Modified

- `packages/agent-badge/src/commands/status.ts` - shared-mode summary and privacy-safe issue-count rendering for normal status output
- `packages/core/src/diagnostics/doctor.ts` - shared-mode and shared-health checks built from `inspectSharedPublishHealth()`
- `packages/core/src/diagnostics/doctor.test.ts` - regression coverage for the new doctor check ids and migration/orphan remediation
- `packages/agent-badge/src/commands/status.test.ts` - healthy shared, orphaned shared, and legacy shared-mode output coverage
- `docs/HOW-IT-WORKS.md` - corrected shared contributor model from aggregate totals to per-session observations keyed by opaque digests
- `docs/TROUBLESHOOTING.md` - stale/conflict/partial/orphaned shared-mode recovery runbooks
- `scripts/verify-docs.sh` - enforced migration and shared-observation terminology checks

## Decisions Made

- Reused the core shared-health inspection report in both command surfaces instead of letting `status` or `doctor` derive independent remote-state heuristics.
- Treated shared diagnostics as privacy-safe summaries only: issue ids, counts, mode, and fixes, but never raw digests or local paths.
- Documented migration through the original publisher machine explicitly so continuity claims match the actual local-first trust boundary.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Existing `status` tests assumed no remote inspection path, so they were updated to inject gist fixtures rather than letting command tests depend on live gist access.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 16 now exposes one coherent shared-health model across publish flows, operator commands, and public docs.
- No blockers remain inside this phase; validation or milestone-close work can rely on the locked shared migration terminology.

## Self-Check: PASSED
