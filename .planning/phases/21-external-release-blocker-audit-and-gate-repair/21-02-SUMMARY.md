---
phase: 21-external-release-blocker-audit-and-gate-repair
plan: 02
subsystem: infra
tags: [npm, release, docs, vitest]
requires:
  - phase: 21-external-release-blocker-audit-and-gate-repair
    provides: baseline external readiness evidence from 21-01
provides:
  - explicit machine-readable blocker taxonomy in release preflight output
  - focused contract tests for auth, version drift, same-version conflict, and manual confirmations
  - release docs and planning state aligned to the same blocker vocabulary
affects: [release, docs, planning-state]
tech-stack:
  added: []
  patterns: [explicit external blocker taxonomy, manual confirmation checks for remote release state]
key-files:
  created: []
  modified:
    - scripts/release/preflight.ts
    - scripts/release/preflight.test.ts
    - docs/RELEASE.md
    - .planning/STATE.md
key-decisions:
  - "Expose external blocker categories directly in preflight results via `blockers` arrays instead of relying on prose-only summaries."
  - "Represent package ownership and trusted-publisher as explicit manual-confirmation checks that become warnings when packages already exist remotely."
patterns-established:
  - "Release tooling must distinguish locally green rehearsal from externally blocked release state with exact category names."
  - "Remote conditions that cannot be auto-proved locally stay explicit as structured warnings, not hidden in narrative text."
requirements-completed: [REL-01, REL-02]
duration: 5 min
completed: 2026-04-05
---

# Phase 21 Plan 02: Repair Preflight, Docs, And Planning State Around Blocker Classification Summary

**Release preflight now exposes explicit blocker categories for npm auth, version drift, same-version conflicts, package ownership, and trusted-publisher state, with matching docs and planning vocabulary**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-05T17:08:28Z
- **Completed:** 2026-04-05T17:13:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added explicit `blockers` classification to machine-readable preflight package/check results.
- Added focused preflight tests for version drift, same-version conflicts, npm auth failure, and manual confirmation states.
- Updated the release checklist and planning state to use the same local-vs-external blocker vocabulary.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend release preflight to expose explicit external blocker categories and lock them with focused tests** - `f49618c`, `0582647` (test, feat)
2. **Task 2: Update the release checklist and planning state to use the same local-vs-external blocker vocabulary** - `51d8085` (docs)

## Files Created/Modified

- `scripts/release/preflight.ts` - Added explicit blocker categories and manual confirmation checks.
- `scripts/release/preflight.test.ts` - Locked the blocker taxonomy with focused contract coverage.
- `docs/RELEASE.md` - Explained `locally green` versus `externally blocked` and documented each blocker category.
- `.planning/STATE.md` - Aligned current blocker wording with the same taxonomy.

## Decisions Made

- Keep the existing safe/warn/blocked status model, but make the actual blocker categories explicit in structured output.
- Model `package ownership` and `trusted-publisher` as explicit manual confirmations that warn only when the package already exists remotely.
- Preserve first-publish `safe` behavior when npm does not yet expose the package names.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no additional human setup file was required for this plan.

## Next Phase Readiness

Phase 21 is complete.
Phase 22 can now execute the trusted publish path from a repo-owned contract that clearly distinguishes local proof from external blockers.
