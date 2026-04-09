---
phase: 13-post-publish-registry-verification-and-final-operations
plan: 01
subsystem: release
tags: [npm, smoke, initializer, vitest, registry]
requires:
  - phase: 12-production-publish-execution
    provides: published package versions and release evidence for 1.1.1
provides:
  - exact-version registry smoke entrypoint for runtime, core, and initializer installs
  - realpath-safe direct-execution guard for the published create-agent-badge bin
  - TDD regression coverage for symlinked initializer execution and footer error handling
affects: [13-02, release-operations, REL-09]
tech-stack:
  added: [bash smoke automation]
  patterns: [passed-or-blocked registry smoke evidence, realpath-aware initializer bin guard]
key-files:
  created:
    - .planning/phases/13-post-publish-registry-verification-and-final-operations/13-01-SUMMARY.md
    - scripts/smoke/verify-registry-install.sh
    - packages/create-agent-badge/src/index.test.ts
  modified:
    - package.json
    - packages/create-agent-badge/src/index.ts
key-decisions:
  - "Keep registry smoke evidence limited to package coordinates and pass/blocked status so local temp paths never leave the machine."
  - "Match the initializer bin footer to the runtime CLI's realpath-based direct-execution guard to catch symlinked npm bin execution."
patterns-established:
  - "Registry smoke scripts should classify live install results as passed or blocked and optionally persist JSON and Markdown evidence."
  - "Published Node entrypoints should export an isDirectExecution helper and catch footer errors by printing error.message and setting process.exitCode = 1."
requirements-completed: [REL-09]
duration: 5m 31s
completed: 2026-04-01
---

# Phase 13 Plan 01: Registry Verification Summary

**Exact-version registry smoke automation plus a symlink-safe initializer entrypoint guard for the published 1.1.1 packages**

## Performance

- **Duration:** 5m 31s
- **Started:** 2026-04-01T10:19:28Z
- **Completed:** 2026-04-01T10:24:59Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added `npm run smoke:registry` and a clean-room registry smoke script that installs `@legotin/agent-badge`, `@legotin/agent-badge-core`, and `create-agent-badge` by exact version, masks GitHub auth, and can persist JSON and Markdown evidence without local paths.
- Added dedicated initializer entrypoint regression coverage for shebang presence, symlinked direct execution, missing argv handling, and footer error reporting.
- Replaced the initializer package's naive `import.meta.url` bin check with the same `realpathSync` plus `fileURLToPath` direct-execution pattern used by the runtime CLI.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the exact-version registry smoke entrypoint and clean-room verification script** - `588e905` (feat)
2. **Task 2: Harden the initializer bin direct-execution guard and cover it with symlink-path tests** - `dbc0922` (test, TDD red)
3. **Task 2: Harden the initializer bin direct-execution guard and cover it with symlink-path tests** - `40d8211` (feat, TDD green)

**Plan metadata:** included in the final docs commit for summary/state/roadmap bookkeeping

## Files Created/Modified

- `package.json` - exposes the root `smoke:registry` maintainer entrypoint.
- `scripts/smoke/verify-registry-install.sh` - runs the exact-version clean-room npm smoke and optional evidence emission.
- `packages/create-agent-badge/src/index.ts` - exports `isDirectExecution()` and catches direct-execution failures.
- `packages/create-agent-badge/src/index.test.ts` - locks in the symlinked bin and footer error-handling regression coverage.
- `.planning/phases/13-post-publish-registry-verification-and-final-operations/13-01-SUMMARY.md` - records execution details for the plan.

## Decisions Made

- Kept registry smoke evidence intentionally minimal so scratch directories and npm cache paths remain terminal-only diagnostics.
- Used the runtime CLI's realpath-safe direct-execution pattern verbatim in `create-agent-badge` rather than maintaining two slightly different bin guards.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Patched planning views after GSD progress tooling refused a partial-phase roadmap update**
- **Found during:** Post-task bookkeeping
- **Issue:** `roadmap update-plan-progress 13` refused to update `ROADMAP.md` because Phase 13 still has an unfinished second plan, and the human-readable `STATE.md` progress line remained stale after the automated state updates.
- **Fix:** Manually updated the visible `STATE.md` progress/activity lines and the Phase 13 entries in `ROADMAP.md` to reflect that `13-01` is complete while the phase remains in progress.
- **Files modified:** `.planning/STATE.md`, `.planning/ROADMAP.md`
- **Verification:** Re-read the updated planning files after patching and confirmed they show Plan 2 of 2 as next and Phase 13 progress as 1/2.
- **Committed in:** final docs commit

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The workaround only corrected planning metadata that the standard helper would not write for an incomplete phase. No product-scope changes.

## Issues Encountered

- Parallel `git add` calls raced on `.git/index.lock`; staging succeeded after retrying sequentially, with no file-content changes required.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 13-02 can now run `npm run smoke:registry -- --version 1.1.1 --check-initializer --write-evidence --phase-dir .planning/phases/13-post-publish-registry-verification-and-final-operations` to capture post-publish proof against the live registry artifacts.
- The release checklist work can reference a repo-owned smoke contract instead of ad hoc registry commands.

---
*Phase: 13-post-publish-registry-verification-and-final-operations*
*Completed: 2026-04-01*

## Self-Check: PASSED

- Verified `.planning/phases/13-post-publish-registry-verification-and-final-operations/13-01-SUMMARY.md` exists.
- Verified task commits `588e905`, `dbc0922`, and `40d8211` exist in git history.
