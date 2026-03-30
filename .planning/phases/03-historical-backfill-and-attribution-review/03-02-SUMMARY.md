---
phase: 03-historical-backfill-and-attribution-review
plan: 02
subsystem: infra
tags: [attribution, overrides, vitest, repo-fingerprint, state-schema]
requires:
  - phase: 03-01
    provides: deduped full-backfill session inventory with local-only attribution hints
provides:
  - deterministic attribution engine with ordered evidence and conservative ambiguity handling
  - stable ambiguous-session override helpers keyed by `provider:providerSessionId`
  - regression coverage for ambiguity exclusion, override reuse, and privacy-safe override keys
affects: [phase-03-scan-reporting, scan-totals, public-api]
tech-stack:
  added: []
  patterns:
    - attribution decisions live in `packages/core/src/attribution` and return both per-session audit data and aggregate status counts
    - persisted ambiguous-session decisions are reapplied through a stable `provider:providerSessionId` key without storing raw evidence values
key-files:
  created:
    - packages/core/src/attribution/attribution-types.ts
    - packages/core/src/attribution/override-store.ts
    - packages/core/src/attribution/index.ts
    - packages/core/src/attribution/attribution-engine.test.ts
  modified:
    - packages/core/src/attribution/attribution-engine.ts
    - packages/core/src/index.ts
key-decisions:
  - "Only repo-root and normalized remote matches auto-include; cwd-only and transcript-only evidence stay ambiguous until a developer override exists."
  - "Override persistence stores only stable `provider:providerSessionId` keys in `overrides.ambiguousSessions`, never raw cwd or transcript correlation values."
  - "Override reuse changes final include/exclude status while preserving the raw evidence reason for later scan reporting."
patterns-established:
  - "Core attribution modules now expose ordered evidence entries that mirror the evaluation priority used by the decision engine."
  - "Override helpers operate on `AgentBadgeState` by returning updated immutable state objects instead of mutating persisted maps in place."
requirements-completed: [ATTR-03, ATTR-04, ATTR-05]
duration: 5 min
completed: 2026-03-30
---

# Phase 03 Plan 02: Attribution Engine Summary

**Deterministic repo attribution with conservative ambiguity handling and stable `provider:session` override reuse**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-30T13:34:08Z
- **Completed:** 2026-03-30T13:38:48Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added a reusable core attribution engine that evaluates repo-root, normalized remote, normalized cwd, transcript correlation, and override reuse in a fixed order.
- Added stable override-store helpers that read and write `overrides.ambiguousSessions` with privacy-safe `provider:providerSessionId` keys only.
- Added targeted Vitest coverage for evidence ordering, ambiguity exclusion from included totals, override reuse, and override-key privacy.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define attribution result types and deterministic evidence ordering** - `a9de1c3` (`feat`)
2. **Task 2: Implement stable ambiguous-session keys and override helpers** - `92891bd` (`feat`)
3. **Task 3: Prove ambiguity exclusion and override reuse with attribution tests** - `845f815` (`fix`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified

- `packages/core/src/attribution/attribution-types.ts` - defines the evidence, status, and attributed-session result shapes used across Phase 3.
- `packages/core/src/attribution/attribution-engine.ts` - classifies sessions with ordered evidence, returns counts, and reapplies stored include/exclude overrides.
- `packages/core/src/attribution/override-store.ts` - builds stable ambiguous-session keys and updates state without storing raw evidence data.
- `packages/core/src/attribution/index.ts` and `packages/core/src/index.ts` - export the new attribution surface from the core package.
- `packages/core/src/attribution/attribution-engine.test.ts` - locks in ambiguity, evidence-ordering, override-reuse, and privacy-safe override-key behavior.

## Decisions Made

- Treated repo-root and normalized remote matches as strong inclusion evidence while keeping weak-only matches ambiguous by default to protect badge credibility.
- Reused the existing `overrides.ambiguousSessions` map directly instead of inventing a second persistence surface for attribution decisions.
- Kept the raw evidence reason unchanged when an override applies so later scan output can explain both the observed evidence and the developer’s stored decision.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Aligned emitted evidence ordering with attribution priority**
- **Found during:** Task 3 (Prove ambiguity exclusion and override reuse with attribution tests)
- **Issue:** The engine produced correct final statuses, but the emitted `evidence` array did not follow the required repo-root -> git-remote -> normalized-cwd -> transcript-correlation order.
- **Fix:** Reworked the evidence builder to emit entries in attribution priority order and added regression assertions for that ordering.
- **Files modified:** packages/core/src/attribution/attribution-engine.ts, packages/core/src/attribution/attribution-engine.test.ts
- **Verification:** `npm run typecheck`; `npm test -- --run packages/core/src/attribution/attribution-engine.test.ts`; `npm test -- --run`
- **Committed in:** `845f815`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix tightened the audit trail to match the intended decision ordering without expanding scope.

## Issues Encountered

- The workspace still lacks local `tsc` and `vitest` binaries under `/Volumes/git`, so verification continued to use `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH"` instead of reinstalling dependencies on the low-space volume.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 03 now has the core attribution results and override helpers needed for `03-03` to format scan output and persist completed-scan metadata safely.

The remaining work is operator-facing: scan-report sections, CLI wiring, and checkpoint-aware state updates on successful scans.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/03-historical-backfill-and-attribution-review/03-02-SUMMARY.md`.
- Verified task commit `a9de1c3` exists in git history.
- Verified task commit `92891bd` exists in git history.
- Verified task commit `845f815` exists in git history.

---
*Phase: 03-historical-backfill-and-attribution-review*
*Completed: 2026-03-30*
