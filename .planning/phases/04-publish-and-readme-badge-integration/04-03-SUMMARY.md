---
phase: 04-publish-and-readme-badge-integration
plan: 03
subsystem: cli
tags: [readme, github-gist, shields, init, vitest]
requires:
  - phase: 04-01
    provides: stable gist target persistence and init publish-target setup
  - phase: 04-02
    provides: aggregate-only gist publishing and the shared first-publish pipeline
provides:
  - managed README badge block insertion with idempotent reruns
  - init-time first publish before README mutation or snippet output
  - deferred badge setup messaging that leaves README content untouched on target or publish failure
affects: [phase-05-refresh, init-cli, readme-badge, onboarding]
tech-stack:
  added: []
  patterns:
    - existing README files use a managed marker block for stable badge updates
    - init reuses the publish pipeline before README mutation and falls back to snippet or deferred messaging instead of placeholder badges
key-files:
  created:
    - packages/core/src/publish/readme-badge.ts
    - packages/core/src/publish/readme-badge.test.ts
  modified:
    - packages/core/src/publish/index.ts
    - packages/agent-badge/src/commands/init.ts
    - packages/agent-badge/src/commands/init.test.ts
key-decisions:
  - "Init now reuses `runFullBackfillScan()`, `attributeBackfillSessions()`, and `publishBadgeToGist()` directly so README edits only happen after a live remote JSON publish succeeds."
  - "README mutation is marker-bounded and idempotent, while repositories without a README receive a pasteable snippet instead of a silently created file."
  - "Deferred publish-target setup or first-publish failures print actionable `- Badge setup deferred:` guidance and leave README content untouched."
patterns-established:
  - "README badge management follows the same managed-block style as other idempotent repo mutations, using `<!-- agent-badge:start -->` and `<!-- agent-badge:end -->` markers."
  - "Init publishes first, persists the updated state, and only then writes README output or snippet messaging from the stable configured badge URL."
requirements-completed: [BOOT-05, PUBL-04]
duration: 13 min
completed: 2026-03-30
---

# Phase 04 Plan 03: README Badge Integration Summary

**Stable init-time README badge insertion with first-publish gating, no-README snippet output, and deferred-path protection**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-30T18:17:00+0200
- **Completed:** 2026-03-30T18:31:06+0200
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a core README badge helper that builds deterministic badge markdown, emits pasteable snippets, and rewrites one managed marker block without duplicating README content.
- Extended `agent-badge init` to run full backfill, attribution, and `publishBadgeToGist()` before touching README output, so inserted badges always point at a live remote JSON target.
- Covered the visible Phase 4 onboarding outcomes: no-README snippet output, rerun idempotency, and deferred/failure paths that leave README content untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create a managed README badge helper with a no-README snippet path** - `9a09b54` (`feat`)
2. **Task 2: Extend init to perform first publish, then insert the badge or emit a snippet** - `6324aa3` (`feat`)

Plan metadata is committed separately with the summary and planning artifacts.

## Files Created/Modified

- `packages/core/src/publish/readme-badge.ts` and `packages/core/src/publish/readme-badge.test.ts` - add the managed marker helpers, snippet builder, and focused README idempotency coverage.
- `packages/core/src/publish/index.ts` - exports the new README badge helper module from the core publish namespace.
- `packages/agent-badge/src/commands/init.ts` - runs first publish during init, writes README badge blocks only after success, prints no-README snippets, and reports deferred badge setup paths.
- `packages/agent-badge/src/commands/init.test.ts` - proves explicit gist publish success, automatic gist creation, snippet output, rerun badge reuse, and deferred-mode README protection.

## Decisions Made

- The init command now shares the same publish pipeline as `agent-badge publish` instead of duplicating badge serialization or gist update logic.
- README badge management uses a dedicated managed block, which lets reruns replace badge content cleanly without scanning or rewriting unrelated README text.
- Missing README files are treated as a supported onboarding path; init prints a pasteable snippet and never creates a README silently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused the existing `/tmp/agent-badge-deps` Vitest toolchain for verification**
- **Found during:** Task 1 verification
- **Issue:** The workspace under `/Volumes/git` still does not expose a repo-local `vitest` binary, so the plan's verification commands failed before running any tests.
- **Fix:** Ran all verification commands with `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH"` so the existing dependency cache could supply `vitest` without reinstalling on the low-space volume.
- **Files modified:** None
- **Verification:** `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH" npm test -- --run packages/core/src/publish/readme-badge.test.ts`, `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH" npm test -- --run packages/agent-badge/src/commands/init.test.ts`, and `PATH="/tmp/agent-badge-deps/node_modules/.bin:$PATH" npm test -- --run packages/core/src/publish/readme-badge.test.ts packages/agent-badge/src/commands/init.test.ts`
- **Committed in:** Not applicable (verification environment only)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No product-scope change. The deviation only affected local verification routing on this machine.

## Issues Encountered

- A parallel `git add` attempt created a transient `.git/index.lock` race during staging. Resolved by switching back to serial git staging for the remaining commits; no repository content was lost.
- The workspace still depends on the existing `/tmp/agent-badge-deps` cache for `vitest` execution until the repo-local toolchain is repaired on the low-space volume.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 4 is now complete end to end: init can establish or reuse the publish target, publish aggregate badge JSON, and connect the repository README to one stable badge URL or emit a snippet when README is absent.

Phase 5 can build incremental refresh, diff-aware publish decisions, and operator UX on top of the finished publish plus README integration flow. The only remaining Phase 4 gap is the manual live GitHub plus Shields smoke check already called out in `04-VALIDATION.md`.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/04-publish-and-readme-badge-integration/04-03-SUMMARY.md`.
- Verified task commit `9a09b54` exists in git history.
- Verified task commit `6324aa3` exists in git history.

---
*Phase: 04-publish-and-readme-badge-integration*
*Completed: 2026-03-30*
