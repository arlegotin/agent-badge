---
phase: 23-post-publish-registry-verification-and-version-alignment
plan: 01
subsystem: release
tags: [npm, registry, smoke, evidence]
requires:
  - phase: 22-trusted-publish-execution-and-evidence-capture
    provides: released `1.1.3` version authority and canonical publish evidence
provides:
  - phase-owned live registry smoke artifacts for the released `1.1.3` packages
  - explicit `npm init agent-badge@latest` resolution evidence
  - reusable artifact-prefix support in the registry smoke script
affects: [release, docs, planning-state]
tech-stack:
  added: []
  patterns: [phase-owned smoke artifacts, separate latest-alias verification]
key-files:
  created:
    - .planning/phases/23-post-publish-registry-verification-and-version-alignment/23-REGISTRY-SMOKE.json
    - .planning/phases/23-post-publish-registry-verification-and-version-alignment/23-REGISTRY-SMOKE.md
    - .planning/phases/23-post-publish-registry-verification-and-version-alignment/23-LATEST-RESOLUTION.md
  modified:
    - scripts/smoke/verify-registry-install.sh
key-decisions:
  - "Keep `13-REGISTRY-SMOKE` as the default artifact prefix so historical Phase 13 flows stay backward compatible."
  - "Record the `npm init agent-badge@latest` outcome in a separate phase-owned artifact instead of overloading the exact-version smoke output."
patterns-established:
  - "Registry smoke can be reused across phases by selecting an artifact prefix instead of hardcoding phase-owned filenames."
  - "Phase-owned registry verification must prove both the exact released version and the user-facing `latest` initializer alias."
requirements-completed: [REG-01, REG-02]
duration: 7 min
completed: 2026-04-05
---

# Phase 23 Plan 01: Capture Phase-Owned Registry Smoke Evidence And Latest Alias Resolution Summary

**Phase 23 now has saved proof that the released `1.1.3` packages install cleanly from npm and that `npm init agent-badge@latest` resolves to the same published surface**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-05T19:08:32Z
- **Completed:** 2026-04-05T19:15:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added artifact-prefix support to the registry smoke script so Phase 23 could own its evidence files without breaking the Phase 13 default.
- Captured live exact-version `1.1.3` smoke artifacts showing both runtime and initializer status as `passed`.
- Recorded a separate `23-LATEST-RESOLUTION.md` artifact proving that all three npm `dist-tags.latest` values are `1.1.3` and that `npm init agent-badge@latest` created the expected repo-local files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Repair the registry smoke writer so Phase 23 can own its evidence files** - `884d911` (feat)
2. **Task 2: Capture exact-version `1.1.3` smoke evidence and record the `@latest` initializer result** - `b3fe7bc` (docs)

## Files Created/Modified

- `scripts/smoke/verify-registry-install.sh` - Added `--artifact-prefix` support while preserving the existing evidence schema and Phase 13 default.
- `.planning/phases/23-post-publish-registry-verification-and-version-alignment/23-REGISTRY-SMOKE.json` - Machine-readable exact-version `1.1.3` registry smoke result.
- `.planning/phases/23-post-publish-registry-verification-and-version-alignment/23-REGISTRY-SMOKE.md` - Human-readable exact-version `1.1.3` registry smoke summary.
- `.planning/phases/23-post-publish-registry-verification-and-version-alignment/23-LATEST-RESOLUTION.md` - Saved `@latest` dist-tag and initializer resolution proof for Phase 23.

## Decisions Made

- Kept the smoke artifact schema unchanged so Phase 23 evidence remains backward compatible with the existing Phase 13 contract.
- Treated Phase 22 publish evidence as the only version authority before running any live registry checks.
- Saved the latest-alias verdict in a dedicated artifact so exact-version smoke and alias resolution remain independently reviewable.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The sandboxed smoke run stalled during `npm install`, so the live registry verification was rerun outside the sandbox to complete the required npm network operations.

## User Setup Required

None - no external service configuration was required for this plan.

## Next Phase Readiness

Ready for `23-02-PLAN.md`.
Wave 2 can now align manifests, lockfile, and release docs to the saved `1.1.3` registry truth captured here.
