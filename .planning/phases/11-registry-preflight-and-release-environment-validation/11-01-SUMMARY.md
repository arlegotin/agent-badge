---
phase: 11-registry-preflight-and-release-environment-validation
plan: 01
subsystem: release-operations
tags: [npm, release, preflight, vitest]
requires:
  - phase: 10-release-rehearsal-and-checklist
    provides: maintainer release checklist and repo-owned release rehearsal commands
provides:
  - repo-owned `npm run release:preflight` entrypoint
  - manifest-derived registry classification for publishable workspace packages
  - deterministic Vitest coverage for registry-state decisions
affects: [REL-07, phase-12, release-process]
tech-stack:
  added: []
  patterns: [manifest-derived publish inventory, repo-owned registry preflight]
key-files:
  created:
    - .planning/phases/11-registry-preflight-and-release-environment-validation/11-01-SUMMARY.md
    - scripts/release/preflight.test.ts
  modified:
    - package.json
    - scripts/release/preflight.ts
    - vitest.config.ts
key-decisions:
  - "The release preflight derives package names and intended versions from workspace manifests instead of maintaining a second publish-target list."
  - "Registry lookup results collapse to safe, warn, and blocked so maintainers get one explicit publish-readiness decision instead of raw npm output."
patterns-established:
  - "Repo-owned release scripts live at the root package.json and point at checked-in TypeScript entrypoints under scripts/."
requirements-completed: [REL-07]
duration: 2 task commits (1 recovered)
completed: 2026-03-31
---

# Phase 11 Plan 01: Registry Preflight Summary

**A repo-owned `npm run release:preflight` command now derives the three publishable packages from workspace manifests, classifies live npm registry state, and reports one overall safe/warn/blocked publish decision**

## Accomplishments

- Added `scripts/release/preflight.ts` as a read-only registry preflight that resolves `@agent-badge/core`, `agent-badge`, and `create-agent-badge` from local manifests and classifies their live registry state.
- Wired the repo-owned `release:preflight` root command and extended Vitest discovery so `scripts/**/*.test.ts` coverage runs with the normal test runner.
- Added deterministic unit coverage for missing-package, blocked-version, ambiguous-metadata, and manifest-inventory behavior without calling the live network.

## Task Commits

1. **Task 1: Create the manifest-derived live registry preflight engine and status report** - `dc296cf` (`feat`)
2. **Task 2: Wire the repo command and add deterministic tests for registry-state classification** - `dff5ca0` (`chore`)

## Verification

- `rg -n 'dist-tags\\.latest|OVERALL:|safe|warn|blocked|@agent-badge/core|agent-badge|create-agent-badge|--json' scripts/release/preflight.ts`
- `npm test -- --run scripts/release/preflight.test.ts`

## Files Created/Modified

- `scripts/release/preflight.ts` - Repo-owned registry preflight and human/JSON decision output.
- `scripts/release/preflight.test.ts` - Deterministic unit coverage for registry classification and manifest inventory.
- `package.json` - Root `release:preflight` maintainer entrypoint.
- `vitest.config.ts` - Includes `scripts/**/*.test.ts` in Vitest discovery.
- `.planning/phases/11-registry-preflight-and-release-environment-validation/11-01-SUMMARY.md` - Execution and verification record for this plan.

## Decisions Made

- Kept the release preflight outside the end-user CLI surface and anchored it to the repository-maintainer workflow.
- Used manifest-derived inventory rather than a duplicated config list so package identity and versions stay consistent with the publishable workspaces.

## Deviations from Plan

- Recovered the already-implemented Task 1 commit from the current branch instead of redoing the same registry-preflight code in a new commit.
- Preserved that valid history and completed the missing command/test wiring as the remaining task work.

## Issues Encountered

- The initial `gsd-executor` agent did not return a completion signal, so plan execution continued inline using the workflow fallback and spot checks.

## Next Phase Readiness

- The repo now has one stable registry-preflight command for the three publishable packages.
- Phase 11-02 can extend the same command with auth, release-input, and workflow-contract checks without changing the command surface.

## Self-Check: PASSED

- Found `scripts/release/preflight.ts`
- Found `scripts/release/preflight.test.ts`
- Verified commits `dc296cf` and `dff5ca0` exist in git history
- Verified `npm test -- --run scripts/release/preflight.test.ts` passed from current source

---
*Phase: 11-registry-preflight-and-release-environment-validation*
*Completed: 2026-03-31*
