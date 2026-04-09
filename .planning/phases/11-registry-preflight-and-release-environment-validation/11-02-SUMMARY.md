---
phase: 11-registry-preflight-and-release-environment-validation
plan: 02
subsystem: release-operations
tags: [npm, release, docs, github-actions]
requires:
  - phase: 11-registry-preflight-and-release-environment-validation
    provides: repo-owned registry preflight and manifest-derived publish inventory
provides:
  - npm auth, release-input, and workflow-contract checks in `npm run release:preflight`
  - maintainer release checklist that requires the preflight before publish
  - deterministic docs-gate coverage for the new release-preflight guidance
affects: [REL-07, phase-12, release-process, docs]
tech-stack:
  added: []
  patterns: [read-only release environment checks, docs-enforced release gate]
key-files:
  created:
    - .planning/phases/11-registry-preflight-and-release-environment-validation/11-02-SUMMARY.md
  modified:
    - docs/RELEASE.md
    - scripts/release/preflight.test.ts
    - scripts/release/preflight.ts
    - scripts/verify-docs.sh
key-decisions:
  - "The release preflight remains read-only while still blocking on missing npm auth, release-input drift, or workflow-contract mismatches."
  - "Docs must enforce `npm run release:preflight` explicitly so the release checklist cannot drift back to ad hoc manual steps."
patterns-established:
  - "Release docs are mechanically enforced by exact required-string assertions in `scripts/verify-docs.sh`."
requirements-completed: [REL-07]
duration: 2 task commits
completed: 2026-03-31
---

# Phase 11 Plan 02: Release Environment Validation Summary

**The same `npm run release:preflight` command now checks npm auth, release-input coherence, and release-workflow markers, while the maintainer checklist and docs gate make that preflight mandatory before publish**

## Accomplishments

- Extended `scripts/release/preflight.ts` with explicit `npm-auth`, `release-inputs`, and `workflow-contract` checks layered onto the existing registry classification.
- Added deterministic blocked-case coverage for auth failures, workflow drift, and inconsistent release inputs while keeping the preflight itself read-only.
- Updated `docs/RELEASE.md` so the required release sequence now includes `npm run release:preflight`, plus the `npm ping`, `npm whoami`, and `NPM_TOKEN` follow-up guidance that local automation cannot prove remotely.
- Extended `scripts/verify-docs.sh` so the release checklist cannot drift away from the repo-owned preflight command.

## Task Commits

1. **Task 1: Extend the preflight with npm auth, workflow-contract, and release-input checks** - `d4f4866` (`feat`)
2. **Task 2: Make release preflight mandatory in the maintainer checklist and enforce it in docs verification** - `21765ff` (`docs`)

## Verification

- `npm test -- --run scripts/release/preflight.test.ts`
- `npm run docs:check`
- `npm run typecheck`

## Files Created/Modified

- `scripts/release/preflight.ts` - Adds npm auth, release-input, and workflow-contract checks to the existing registry preflight.
- `scripts/release/preflight.test.ts` - Covers blocked auth, workflow drift, and inconsistent release-input cases.
- `docs/RELEASE.md` - Requires `npm run release:preflight` before `npm run release` and explains the remaining GitHub Actions secret follow-up.
- `scripts/verify-docs.sh` - Enforces the new release-preflight guidance in docs.
- `.planning/phases/11-registry-preflight-and-release-environment-validation/11-02-SUMMARY.md` - Execution and verification record for this plan.

## Decisions Made

- Kept the release-environment checks inside the existing repo-owned preflight instead of adding a second maintainer command.
- Treated GitHub Actions secret presence as a documented human follow-up while still validating the checked-in workflow markers automatically.

## Deviations from Plan

None - plan executed as written once the repo-owned preflight surface from 11-01 was available.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 11 now blocks on the same categories that would otherwise derail a real publish in Phase 12: registry conflicts, missing npm auth, release-input drift, and workflow-contract drift.
- Phase 12 can use `npm run release:preflight` as the final go/no-go gate immediately before the production publish path.

## Self-Check: PASSED

- Found `docs/RELEASE.md`
- Found `scripts/verify-docs.sh`
- Verified commits `d4f4866` and `21765ff` exist in git history
- Verified `npm test -- --run scripts/release/preflight.test.ts`, `npm run docs:check`, and `npm run typecheck` passed from current source

---
*Phase: 11-registry-preflight-and-release-environment-validation*
*Completed: 2026-03-31*
