---
phase: 22-trusted-publish-execution-and-evidence-capture
plan: 01
subsystem: release
tags: [github-actions, npm, release, evidence]
requires:
  - phase: 21-external-release-blocker-audit-and-gate-repair
    provides: explicit blocker taxonomy and live external readiness baseline
provides:
  - phase-owned preflight capture for the released `1.1.3` source state
  - canonical GitHub Actions workflow run metadata for the production publish
  - explicit release decision that reuses the recovered trusted publish instead of dispatching a duplicate release
affects: [release, planning-state, evidence]
tech-stack:
  added: []
  patterns: [released-source preflight capture, GitHub Actions run recovery, reconciliation-before-republish]
key-files:
  created:
    - .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-preflight.json
    - .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md
  modified: []
key-decisions:
  - "Treat GitHub Actions run `24005943027` as the canonical trusted publish for `1.1.3` because it is recoverable, successful, and lines up with the `github-actions[bot]` release commit `db3ff4f`."
  - "Use a clean temporary checkout of `db3ff4f` to generate phase-owned preflight evidence instead of running preflight against the stale local `1.1.2` manifests."
  - "Do not trigger a new production publish from the stale local branch because the already-published `1.1.3` release already proves the maintained workflow path."
patterns-established:
  - "Production publish evidence must distinguish the workflow's triggering commit from the workflow-generated release commit."
  - "When a release has already shipped, Phase 22 reconciles and captures the canonical run before considering any replacement dispatch."
requirements-completed: [PUB-01, PUB-02]
duration: 18 min
completed: 2026-04-05
---

# Phase 22 Plan 01: Execute The Trusted-Publishing Release Path For The Current Source Summary

**The already-shipped `1.1.3` release is now pinned to one exact successful GitHub Actions run, so Phase 22 can use recovered publish truth instead of manufacturing a duplicate release**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-05T18:08:00Z
- **Completed:** 2026-04-05T18:26:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Generated [22-preflight.json](/Volumes/git/legotin/agent-badge/.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-preflight.json) from a clean temporary checkout of the released `db3ff4f` source, not from the stale local planning branch.
- Recovered the exact canonical `release.yml` run that published `1.1.3`, including run ID, URLs, job steps, trigger commit, and release commit timing.
- Recorded an explicit release decision that Phase 22 should reuse the recovered trusted publish and move on to evidence capture instead of dispatching a fresh publish.

## Task Commits

Each task was committed atomically:

1. **Task 1: Capture a phase-owned preflight snapshot for the reconciled Phase 22 release candidate** - `e050f35` (docs)
2. **Task 2: Recover or execute exactly one canonical GitHub Actions trusted-publishing run and record the release decision** - `258768f` (docs)

## Files Created/Modified

- `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-preflight.json` - Preflight report generated against the released `1.1.3` source state.
- `.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md` - Canonical workflow run record, reconciliation notes, and release decision.

## Decisions Made

- Accepted GitHub Actions run `24005943027` as the canonical publish because it is publicly recoverable, successful, and its publish and commit windows line up exactly with the `db3ff4f` release commit.
- Treated the released-source preflight's `same version already published` result as expected post-release proof rather than as a reason to dispatch a replacement release.
- Preserved the `github-actions` publish path as the only valid Phase 22 evidence path.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `tsx` still hit the known sandbox IPC `listen EPERM` failure, so the released-source preflight had to be generated through one escalated `tsx` run.
- GitHub's combined commit status and check-runs endpoints were empty for the release commit itself, so the canonical run had to be recovered from the `release.yml` workflow-runs and jobs endpoints instead.

## User Setup Required

None for this plan. The canonical release run was recovered successfully, so no manual workflow dispatch checkpoint was needed.

## Next Phase Readiness

Ready for `22-02-PLAN.md`.
Wave 2 can now repair the evidence writer and generate phase-owned `22-PUBLISH-EVIDENCE.*` artifacts using the recovered run metadata and published commit recorded here.
