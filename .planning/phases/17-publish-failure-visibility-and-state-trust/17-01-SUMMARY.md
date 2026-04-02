---
phase: 17-publish-failure-visibility-and-state-trust
plan: 01
subsystem: cli
tags: [publish, refresh, status, trust, vitest]
requires:
  - phase: 16-migration-diagnostics-and-team-operator-ux
    provides: shared publish health diagnostics and shared-mode status output
provides:
  - live badge trust derivation from persisted refresh and publish facts
  - refresh output that reports stale, unchanged, current, and not-attempted badge trust
  - status output that separates live badge trust from shared-mode health
affects: [17-02, 17-03, doctor, diagnostics]
tech-stack:
  added: []
  patterns:
    - derive operator trust from persisted state before canonical diagnostics land
    - keep live badge trust separate from shared publish health vocabulary
key-files:
  created:
    - packages/core/src/publish/publish-trust.ts
    - packages/core/src/publish/publish-trust.test.ts
  modified:
    - packages/core/src/publish/index.ts
    - packages/agent-badge/src/commands/refresh.ts
    - packages/agent-badge/src/commands/refresh.test.ts
    - packages/agent-badge/src/commands/status.ts
    - packages/agent-badge/src/commands/status.test.ts
key-decisions:
  - "Publish trust stays a core state-derived report, and command wording is shared from that core helper instead of duplicated in each command."
  - "Live badge trust prints before shared-mode health so stale badge risk is visible without conflating badge freshness with contributor health."
patterns-established:
  - "Trust-report pattern: derive operator-visible badge freshness from state.refresh plus state.publish without remote reads."
  - "Command-output pattern: surface live badge trust and last successful badge update as separate lines ahead of shared-mode diagnostics."
requirements-completed: [OPER-01]
duration: 7m 40s
completed: 2026-04-02
---

# Phase 17 Plan 01: Publish Trust Output Summary

**Core publish-trust derivation plus refresh and status trust lines that expose stale failed publishes, unchanged badge writes, and not-attempted badge state**

## Performance

- **Duration:** 7m 40s
- **Started:** 2026-04-02T07:35:16Z
- **Completed:** 2026-04-02T07:42:56Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `derivePublishTrustReport()` with test coverage for not-attempted, unchanged, current, and stale-after-failed-publish states.
- Wired refresh output to print live badge trust on successful and failed-soft flows, including the last successful badge update when helpful.
- Added a dedicated `- Live badge trust:` status line ahead of shared-mode health so badge freshness and shared contributor health stay separate.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a dedicated live-badge trust helper that derives operator-visible state from persisted refresh and publish facts** - `0dd2768` (test), `521c734` (feat)
2. **Task 2: Surface live-badge trust in refresh and status while keeping shared-health on separate lines** - `c6b07f4` (test), `480b702` (feat)

_Note: Both tasks used TDD red/green commits._

## Files Created/Modified

- `packages/core/src/publish/publish-trust.ts` - Core trust report and shared trust-status formatter for CLI surfaces.
- `packages/core/src/publish/publish-trust.test.ts` - Regression coverage for the persisted-state trust classifications.
- `packages/core/src/publish/index.ts` - Core publish export surface for the new trust helper.
- `packages/agent-badge/src/commands/refresh.ts` - Refresh summary and failed-soft output now include live badge trust lines.
- `packages/agent-badge/src/commands/refresh.test.ts` - Refresh coverage for unchanged and stale-after-failed-publish messaging.
- `packages/agent-badge/src/commands/status.ts` - Status report now prints live badge trust and last successful badge update before shared-mode lines.
- `packages/agent-badge/src/commands/status.test.ts` - Status coverage for not-attempted and stale-after-failed-publish trust output.

## Decisions Made

- Kept the trust helper limited to persisted `refresh` and `publish` facts so Phase 17-01 does not depend on remote gist inspection.
- Added a shared `formatPublishTrustStatus()` helper in core so `refresh` and `status` reuse the same operator vocabulary.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- A transient `.git/index.lock` appeared when staging and committing in parallel; rerunning the commit serially resolved it without changing repo content.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 17-02 can now persist canonical publish-attempt diagnostics behind an already-tested trust vocabulary.
- Phase 17-03 can reuse the same trust helper/formatter for `doctor` without redefining the operator-facing language.

## Self-Check: PASSED

- Found summary file: `.planning/phases/17-publish-failure-visibility-and-state-trust/17-01-SUMMARY.md`
- Found task commits: `0dd2768`, `521c734`, `c6b07f4`, `480b702`
- Stub scan across plan-touched files found no placeholder output or TODO/FIXME markers
