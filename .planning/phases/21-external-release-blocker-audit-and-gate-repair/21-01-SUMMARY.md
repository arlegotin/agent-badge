---
phase: 21-external-release-blocker-audit-and-gate-repair
plan: 01
subsystem: infra
tags: [npm, release, preflight, evidence]
requires:
  - phase: 20-verification-artifact-closure-and-audit-recovery
    provides: milestone-closeout context and current release-readiness baseline
provides:
  - machine-readable live release preflight artifact for the current source tree
  - operator-readable readiness summary separating local gates from external blockers
  - explicit human follow-up checklist for npm auth, package ownership, and trusted publisher confirmation
affects: [release, docs, planning-state]
tech-stack:
  added: []
  patterns: [phase-owned release evidence, explicit local-vs-external readiness boundary]
key-files:
  created:
    - .planning/phases/21-external-release-blocker-audit-and-gate-repair/21-preflight.json
    - .planning/phases/21-external-release-blocker-audit-and-gate-repair/21-EXTERNAL-READINESS.md
    - .planning/phases/21-external-release-blocker-audit-and-gate-repair/21-USER-SETUP.md
  modified: []
key-decisions:
  - "Treat unauthorized npm auth and registry-visible 1.1.3 package versions as explicit external blockers instead of collapsing them into a generic readiness warning."
  - "Keep package ownership and trusted-publisher state as manual confirmations until the repo-owned preflight contract can name them explicitly."
patterns-established:
  - "Release-readiness artifacts must separate locally green rehearsal proof from externally blocked publish state."
  - "Phase-owned evidence may record visible package metadata and statuses, but never secrets or credential material."
requirements-completed: [REL-01, REL-02]
duration: 4 min
completed: 2026-04-05
---

# Phase 21 Plan 01: Audit Live Release Blockers And Reconcile The Exact External Readiness Gap Summary

**Live preflight evidence now freezes the blocked npm auth state, registry version drift, and unresolved manual ownership/trusted-publisher confirmations for the current source tree**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05T17:03:42Z
- **Completed:** 2026-04-05T17:07:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Captured the exact live `release:preflight` JSON output for the current source tree in a phase-owned artifact.
- Wrote an operator-readable readiness summary that distinguishes local green release gates from external blockers.
- Added a human-only setup checklist for the remaining npm auth, package ownership, and trusted-publisher confirmations.

## Task Commits

Each task was committed atomically:

1. **Task 1: Capture the current live preflight result as a phase-owned artifact** - `09f078f` (docs)
2. **Task 2: Write the operator-readable external readiness-gap summary from the captured artifact and manual confirmations** - `357e431` (docs)

## Files Created/Modified

- `.planning/phases/21-external-release-blocker-audit-and-gate-repair/21-preflight.json` - Machine-readable live release-preflight capture for the current source tree.
- `.planning/phases/21-external-release-blocker-audit-and-gate-repair/21-EXTERNAL-READINESS.md` - Human-readable summary of local proof, live blockers, and manual confirmations.
- `.planning/phases/21-external-release-blocker-audit-and-gate-repair/21-USER-SETUP.md` - Human-only follow-up checklist for the remaining external confirmations.

## Decisions Made

- Treat the current `npm whoami` failure as a hard external blocker, not a soft warning, because publish identity cannot be proven from this maintainer environment.
- Treat registry-visible `1.1.3` versions across all three packages as explicit version drift against the checked-in `1.1.2` manifests.
- Keep package ownership and trusted-publisher state marked as manual until the repo contract can express those categories directly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `tsx` could not open its IPC pipe inside the sandbox (`listen EPERM`), so the repo-owned preflight command had to be rerun outside the sandbox to capture the live artifact.

## User Setup Required

External services require manual configuration. See `21-USER-SETUP.md` for:

- npm auth verification steps
- npm package ownership confirmation
- trusted-publisher confirmation for the production workflow

## Next Phase Readiness

Ready for `21-02-PLAN.md`.
Wave 2 can now repair `scripts/release/preflight.ts`, tests, docs, and planning state from the exact blocker evidence captured here.
