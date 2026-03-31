---
phase: 10-release-rehearsal-and-checklist
plan: 02
subsystem: release-documentation
tags: [documentation, release, verification, operations]
requires:
  - phase: 10-release-rehearsal-and-checklist
    provides: standalone packed-install rehearsal proven from current source
provides:
  - maintainer-facing release checklist grounded in repo-owned commands
  - README link to the release checklist
  - deterministic docs gate coverage for release-checklist content
affects: [OPER-06, release-process, docs]
tech-stack:
  added: []
  patterns: [repo-owned release checklist, deterministic docs assertions]
key-files:
  created:
    - docs/RELEASE.md
    - .planning/phases/10-release-rehearsal-and-checklist/10-02-SUMMARY.md
  modified:
    - README.md
    - scripts/verify-docs.sh
key-decisions:
  - "The canonical maintainer rehearsal should stay anchored to `npm run verify:clean-checkout`, with `npm run smoke:pack` documented only as the focused rerun for packed-install failures."
  - "Publish-time `npm view` checks must be documented as live preflight steps, not as static facts captured during planning on 2026-03-31."
patterns-established:
  - "Release docs are mechanically enforced by `scripts/verify-docs.sh` using exact required-string assertions."
requirements-completed: [OPER-06]
duration: 2 task commits
completed: 2026-03-31
---

# Phase 10 Plan 02: Release Checklist Summary

**One maintainer-facing release checklist now mirrors the repo's actual rehearsal commands, explains constrained-machine cache and scratch-space usage, and is enforced by the existing docs verification gate**

## Accomplishments

- Added `docs/RELEASE.md` as the single maintainer release checklist, grounding the process in `npm run docs:check`, `npm run typecheck`, `npm run verify:clean-checkout`, and `npm run release`.
- Documented the constrained-machine operating pattern explicitly: prefer `/tmp` scratch space, set `npm_config_cache` under `/tmp`, and treat `npm run smoke:pack` as the focused rerun for packed-install failures rather than the full release sequence.
- Added live publish-time registry checks for `agent-badge`, `create-agent-badge`, and `@agent-badge/core`, with an explicit note that registry state seen on 2026-03-31 is time-sensitive and must be rechecked immediately before publish.
- Linked the checklist from `README.md` and extended `scripts/verify-docs.sh` so the release doc and its required commands remain mechanically enforced.

## Task Commits

1. **Task 1: Author one maintainer release checklist grounded in the repo-owned rehearsal commands** - `fdc360e` (`docs`)
2. **Task 2: Make the release checklist discoverable and enforce it through the existing docs gate** - `580e472` (`chore`)

## Verification

- `rg -n 'npm run docs:check|npm run typecheck|npm run verify:clean-checkout|npm run smoke:pack|npm_config_cache|/tmp|npm view agent-badge|npm view create-agent-badge|npm view @agent-badge/core|npm run release' docs/RELEASE.md`
- `npm run docs:check`
- `npm run verify:clean-checkout`

## Files Created/Modified

- `docs/RELEASE.md` - Maintainer release checklist covering local gates, constrained-machine guidance, live registry preflight, and publish command.
- `README.md` - Documentation index now links to the release checklist.
- `scripts/verify-docs.sh` - Enforces the presence of `docs/RELEASE.md`, the README link, and the checklist's required release strings.
- `.planning/phases/10-release-rehearsal-and-checklist/10-02-SUMMARY.md` - Records execution and verification for this plan.

## Decisions Made

- Kept the release checklist aligned with the existing workflow-driven publish path instead of introducing new release tooling or ad-hoc shell sequences.
- Required live `npm view` checks at publish time because package-name and registry state can change after March 31, 2026.

## Deviations from Plan

- The first sandboxed `npm run verify:clean-checkout` run stalled in the fresh-project `npm install` step. The same command was rerun outside the sandbox and passed, matching the existing environment note from Phase 09.

## Issues Encountered

- Sandboxed dependency installation remained unreliable for the clean-checkout rehearsal when the temp npm cache started cold. Unsandboxed verification completed successfully with the same repo-owned command.

## Next Phase Readiness

- OPER-06 is now satisfied by one discoverable release checklist wired into the docs gate.
- Phase 10 is ready for goal-based verification and phase completion.

## Self-Check: PASSED

- Found `docs/RELEASE.md`
- Verified commits `fdc360e` and `580e472` exist in git history
- Verified `npm run docs:check` and `npm run verify:clean-checkout` passed from current source

---
*Phase: 10-release-rehearsal-and-checklist*
*Completed: 2026-03-31*
