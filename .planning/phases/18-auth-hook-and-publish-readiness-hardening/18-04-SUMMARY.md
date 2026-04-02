---
phase: 18-auth-hook-and-publish-readiness-hardening
plan: 04
subsystem: publish
tags: [publish, auth, refresh, uat, vitest]
requires:
  - phase: 18-auth-hook-and-publish-readiness-hardening
    provides: canonical publish readiness and pre-push degraded-state vocabulary
provides:
  - auth-aware publish failure classification for live GitHub write/readback failures
  - sanitized auth-missing command output that avoids raw GitHub REST auth text
  - standard refresh degraded-state summaries that match hook-mode readiness/trust wording
affects: [publish, refresh, human-uat, phase-19]
tech-stack:
  added: []
  patterns:
    - normalize typed auth failures to one operator-safe message before surfacing them
    - reuse the same degraded refresh summary for both hook and standard execution paths
key-files:
  created: []
  modified:
    - packages/core/src/publish/publish-service.ts
    - packages/core/src/publish/publish-service.test.ts
    - packages/agent-badge/src/commands/publish.ts
    - packages/agent-badge/src/commands/publish.test.ts
    - packages/agent-badge/src/commands/refresh.ts
    - packages/agent-badge/src/commands/refresh.test.ts
key-decisions:
  - "GitHub auth failures during gist reads, writes, and readback verification now normalize to `auth-missing` instead of staying trapped in the generic remote failure buckets."
  - "Command surfaces defensively sanitize typed `auth-missing` errors so raw Octokit auth text cannot leak back into operator output even if an upstream caller hands through an unsanitized typed error."
patterns-established:
  - "Auth-surface normalization: treat auth-related GitHub transport failures as readiness state first, raw upstream text second."
  - "Degraded-summary parity: normal refresh failures print the same readiness/trust summary path that hook-mode already used."
requirements-completed: [OPER-03, AUTH-01, AUTH-02, CTRL-01]
duration: 5m
completed: 2026-04-02
---

# Phase 18 Plan 04: Live Auth-Failure Reporting Gap Closure Summary

**Auth-related publish failures now surface canonical `auth missing` readiness output, and normal refresh failures print the same degraded readiness/trust summary as hook mode**

## Performance

- **Duration:** 5m
- **Started:** 2026-04-02T11:06:03Z
- **Completed:** 2026-04-02T11:11:27Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Reclassified unauthenticated GitHub gist operations in `publish-service.ts` so live auth failures surface as `auth-missing` instead of `remote-write-failed`.
- Sanitized `publish` and `refresh` auth-failure surfacing so canonical readiness output does not echo raw `Requires authentication - https://docs.github.com/rest` text.
- Reused the existing degraded refresh summary path for standard non-hook failures so normal refresh now prints both `- Publish readiness:` and `- Live badge trust:` before exiting non-zero.
- Added regressions that pin the live UAT scenarios for typed auth failures, standard refresh failure summaries, and vocabulary parity with hook-mode output.

## Task Commits

No task commits were created in this execution because the repo already had unrelated dirty-worktree changes and the gap closure was completed safely without mixing user edits into a partial commit.

## Files Created/Modified

- `packages/core/src/publish/publish-service.ts` - Normalizes GitHub auth failures into `auth-missing` and replaces raw transport auth text with operator-safe wording.
- `packages/core/src/publish/publish-service.test.ts` - Locks the live auth-write regression to `auth-missing`.
- `packages/agent-badge/src/commands/publish.ts` - Sanitizes typed auth failures before surfacing them back to the operator.
- `packages/agent-badge/src/commands/publish.test.ts` - Verifies `publish` prints canonical auth readiness without leaking raw GitHub REST auth text.
- `packages/agent-badge/src/commands/refresh.ts` - Prints degraded readiness/trust summaries for standard refresh failures and sanitizes typed auth failures.
- `packages/agent-badge/src/commands/refresh.test.ts` - Verifies standard refresh failure summaries, auth wording, and raw-text suppression.

## Decisions Made

- Kept the auth normalization additive and narrow: only clearly auth-related GitHub failures are remapped to `auth-missing`; other gist reachability and readback classifications remain unchanged.
- Added command-level auth sanitization on top of service-level classification so the operator-facing contract stays stable even when tests or future callers inject a typed auth failure directly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The standard refresh catch path already had the correct degraded summary helper, but it was only being used for hook-mode and fail-soft execution. Reusing that path for standard failures closed the live UAT gap without inventing a second wording branch.

## User Setup Required

None.

## Next Phase Readiness

- The code gap behind the failed Phase 18 human UAT is closed.
- The remaining work is to rerun live `publish` and standard `refresh` UAT against real GitHub auth/gist conditions before Phase 18 can be treated as fully closed.

## Self-Check: PASSED

- Found summary file: `.planning/phases/18-auth-hook-and-publish-readiness-hardening/18-04-SUMMARY.md`
- Targeted gap-closure suite passed:
  - `npm test -- --run packages/core/src/publish/publish-service.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts`
