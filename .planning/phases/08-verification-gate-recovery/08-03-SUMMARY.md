---
phase: 08-verification-gate-recovery
plan: 03
subsystem: infra
tags: [ci, release, verification, npm, tarballs]
requires:
  - phase: 08-verification-gate-recovery
    provides: green build and test gates from plans 08-01 and 08-02
provides:
  - a deterministic clean-checkout verification entrypoint
  - workflow reuse of one release-critical verification command
  - clean artifact rebuilds that invalidate stale TypeScript build metadata
affects: [release-readiness, ci, release, REL-06]
tech-stack:
  added: []
  patterns: [single verification entrypoints, clean rebuilds clear tsbuildinfo, isolated npm cache for pack-smoke flows]
key-files:
  created:
    - .planning/phases/08-verification-gate-recovery/08-03-SUMMARY.md
    - scripts/verify-clean-checkout.sh
  modified:
    - package.json
    - scripts/smoke/verify-packed-install.sh
    - .github/workflows/ci.yml
    - .github/workflows/release.yml
key-decisions:
  - "Release-critical CI and release jobs should call one repo-owned verifier instead of duplicating build/test/pack/smoke steps."
  - "Clean artifact verification must clear package dist output and tsbuildinfo so root TypeScript builds re-emit runtime files from scratch."
patterns-established:
  - "When release checks depend on built artifacts, use one script entrypoint and reuse it in workflows."
  - "A clean-checkout rebuild for TypeScript project references must invalidate incremental metadata, not just delete dist directories."
requirements-completed: [REL-06]
duration: 12m
completed: 2026-03-31
---

# Phase 08 Plan 03: Verification Gate Recovery Summary

**One clean-checkout verifier now rebuilds from scratch, reuses isolated pack/smoke checks, and gates both CI release-readiness and the release workflow**

## Performance

- **Duration:** 12m
- **Started:** 2026-03-31T10:39:00Z
- **Completed:** 2026-03-31T10:50:57Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `scripts/verify-clean-checkout.sh` and the root `verify:clean-checkout` script so release-critical verification has one explicit repo entrypoint.
- Rebased the clean-state path to remove package `dist/` output, clear stale `*.tsbuildinfo`, rebuild, run the full test suite, then run pack and packed-install smoke checks through an isolated npm cache.
- Updated CI `release-readiness` and the release workflow to call the shared verifier instead of maintaining parallel build/test/pack/smoke blocks that can drift.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a clean-checkout verification script that rebuilds from a clean artifact state** - `c769eb7` (`fix`)
2. **Task 2: Wire clean-checkout verification into CI and release-critical workflows** - `327dfec` (`chore`)
3. **Plan metadata:** pending metadata commit

## Verification

- `bash scripts/verify-clean-checkout.sh`
- `rg -n '#!/usr/bin/env bash|set -euo pipefail|dist|tsbuildinfo|npm run build|npm test -- --run|npm run pack:check|npm run smoke:pack|"verify:clean-checkout": "bash scripts/verify-clean-checkout.sh"' scripts/verify-clean-checkout.sh package.json scripts/smoke/verify-packed-install.sh`
- `rg -n 'verify:clean-checkout|release-readiness|changesets/action@v1|Packed install smoke check passed\.' .github/workflows/ci.yml .github/workflows/release.yml scripts/smoke/verify-packed-install.sh`
- `bash scripts/verify-clean-checkout.sh`

## Files Created/Modified

- `.planning/phases/08-verification-gate-recovery/08-03-SUMMARY.md` - Execution summary for this plan.
- `scripts/verify-clean-checkout.sh` - Clean artifact verifier that clears stale build output and reruns build, tests, pack checks, and smoke checks with an isolated npm cache.
- `package.json` - Adds the shared `verify:clean-checkout` script entrypoint.
- `scripts/smoke/verify-packed-install.sh` - Honors a caller-provided `npm_config_cache` so the clean verifier controls pack/smoke cache isolation end to end.
- `.github/workflows/ci.yml` - Routes the `release-readiness` job through `npm run verify:clean-checkout` while keeping validate and scenario-matrix intact.
- `.github/workflows/release.yml` - Runs the shared clean-checkout verifier in the release job and prepares an isolated HOME before the release-critical path.

## Decisions Made

- Put release-critical verification behind one repo-owned script so CI and release use the same clean-state contract.
- Clear package `*.tsbuildinfo` alongside `dist/` because project-reference builds otherwise skip re-emitting runtime artifacts after a manual clean.
- Keep shared planning files untouched because this forked workspace already contains unrelated `.planning/` changes owned by another executor.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Smoke verification needed cache passthrough from the new clean verifier**
- **Found during:** Task 1 (Add a clean-checkout verification script that rebuilds from a clean artifact state)
- **Issue:** `scripts/smoke/verify-packed-install.sh` always created its own npm cache path, so the new clean-checkout verifier could not control one isolated cache for both pack and smoke steps.
- **Fix:** Allowed the smoke script to reuse a caller-provided `npm_config_cache`, while keeping the same success message and behavior when no cache is supplied.
- **Files modified:** `scripts/smoke/verify-packed-install.sh`
- **Verification:** `bash scripts/verify-clean-checkout.sh`
- **Committed in:** `c769eb7`

**2. [Rule 3 - Blocking] Clean rebuild had to invalidate stale TypeScript build metadata**
- **Found during:** Task 1 (Add a clean-checkout verification script that rebuilds from a clean artifact state)
- **Issue:** Removing `dist/` alone left `tsc -b` project references believing the packages were already up to date, so tarballs contained only `package.json` and the packed-install smoke check failed from a clean state.
- **Fix:** Cleared package `*.tsbuildinfo` files before `npm run build` so the clean-checkout verifier forces a real re-emit of runtime artifacts.
- **Files modified:** `scripts/verify-clean-checkout.sh`
- **Verification:** `bash scripts/verify-clean-checkout.sh`
- **Committed in:** `c769eb7`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were required to make the clean-checkout verifier represent a true clean artifact state. No scope was added beyond the release-critical verification path.

## Issues Encountered

- The first clean-checkout run exposed a real incremental-build edge case: package `dist/` output was deleted, but existing `tsbuildinfo` files prevented `npm run build` from re-emitting artifacts. Fixing that made the verification path authoritative instead of stale-artifact dependent.
- The packed-install smoke step needed registry access for workspace package dependencies, so end-to-end verification was rerun outside the sandbox.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- REL-06 now has a single clean-checkout command that rebuilds from scratch and passes in this workspace.
- CI and release workflows both point at the same release-critical verification entrypoint.
- Shared planning files were intentionally not updated in this execution because they are already dirty from parallel work in the same forked workspace.

## Self-Check: PASSED

- Found `.planning/phases/08-verification-gate-recovery/08-03-SUMMARY.md`
- Verified task commits `c769eb7` and `327dfec` exist in git history

---
*Phase: 08-verification-gate-recovery*
*Completed: 2026-03-31*
