---
phase: 10-release-rehearsal-and-checklist
plan: 01
subsystem: release-rehearsal
tags: [packaging, smoke, release, verification]
requires:
  - phase: 09-package-metadata-and-tarball-integrity
    provides: exact tarball integrity enforcement before smoke-install rehearsal
provides:
  - standalone packed-install rehearsal that rebuilds from a cleaned tree
  - exact tarball resolution for core, runtime, and initializer packages
  - operator-facing smoke output that identifies scratch paths and tarball names
affects: [PACK-03, release-packaging, smoke-pack]
tech-stack:
  added: []
  patterns: [build-before-pack, exact tarball resolution, isolated-cache smoke install]
key-files:
  created:
    - .planning/phases/10-release-rehearsal-and-checklist/10-01-SUMMARY.md
  modified:
    - scripts/smoke/verify-packed-install.sh
key-decisions:
  - "The packed-install smoke rehearsal should satisfy its own build precondition instead of relying on verify:clean-checkout to have built first."
  - "Tarballs should be resolved exactly before install so the proof cannot silently double-match agent-badge-core via the agent-badge prefix."
patterns-established:
  - "Release smoke scripts should print their scratch directories and exact artifact basenames before install so constrained-machine failures stay diagnosable."
requirements-completed: [PACK-03]
duration: 2 task commits
completed: 2026-03-31
---

# Phase 10 Plan 01: Release Rehearsal Summary

**Standalone packed-install proof now rebuilds from a cleaned tree, installs the exact three tarballs, and reports enough context to debug constrained-environment failures quickly**

## Accomplishments

- Updated `scripts/smoke/verify-packed-install.sh` to run `npm run build` before any `npm pack --workspace ...` call, so `npm run smoke:pack` no longer depends on earlier build state.
- Replaced the overlapping `agent-badge-*.tgz` install contract with exact tarball resolution for `@agent-badge/core`, `agent-badge`, and `create-agent-badge`, failing fast if any tarball is missing or ambiguous.
- Added operator-facing output for `PACK_DIR`, `INSTALL_DIR`, `NPM_CACHE_DIR`, and the exact tarball basenames before `npm install`, while preserving the import proof and both installed CLI `--help` checks.

## Task Commits

1. **Task 1: Make `smoke:pack` safe as a standalone rehearsal by satisfying the build precondition before packing** - `ab00fbd` (`fix`)
2. **Task 2: Resolve exact tarball identities and keep the packed-install proof diagnosable** - `a165adb` (`feat`)

## Verification

- `rg -n 'npm run build|npm pack --workspace packages/core|npm pack --workspace packages/agent-badge|npm pack --workspace packages/create-agent-badge|mktemp -d "\\$\\{TMPDIR:-/tmp\\}/agent-badge-pack-smoke\\.XXXXXX"|NPM_CACHE_DIR="\\$\\{npm_config_cache:-\\$\\{WORK_DIR\\}/npm-cache\\}"' scripts/smoke/verify-packed-install.sh`
- `rg -n 'CORE_TARBALL=|AGENT_BADGE_TARBALL=|CREATE_AGENT_BADGE_TARBALL=|npm run build|npm pack --workspace packages/core|npm pack --workspace packages/agent-badge|npm pack --workspace packages/create-agent-badge|import\\x28\\x27agent-badge\\x27\\x29|import\\x28\\x27create-agent-badge\\x27\\x29|agent-badge --help|create-agent-badge --help|PACK_DIR|INSTALL_DIR|NPM_CACHE_DIR' scripts/smoke/verify-packed-install.sh`
- `find packages -type d -name dist -prune -exec rm -rf {} + && find packages -type f -name '*.tsbuildinfo' -delete && npm_config_cache=/tmp/agent-badge-npm-cache bash scripts/smoke/verify-packed-install.sh`

## Files Created/Modified

- `scripts/smoke/verify-packed-install.sh` - Rebuilds before packing, resolves exact tarballs, and prints diagnosable operator context before the fresh-project install.
- `.planning/phases/10-release-rehearsal-and-checklist/10-01-SUMMARY.md` - Records the implementation, verification, and execution notes for this plan.

## Decisions Made

- Kept the proof surface narrow: the smoke rehearsal still validates the installed package imports plus both installed CLI help surfaces from the temporary project.
- Chose exact tarball lookup with explicit ambiguity failures instead of broad globs so the release proof matches the intended artifact set exactly.

## Deviations from Plan

- The first Wave 1 handoff to a `gsd-executor` agent completed Task 1 and committed `ab00fbd`, but then stalled before returning a completion signal or finishing the rest of the plan. The remaining work was completed inline from the same working tree following the same read-first and verification steps.

## Issues Encountered

- None in the final local verification run. The cleaned-tree smoke rehearsal completed successfully inside the current workspace sandbox.

## Next Phase Readiness

- PACK-03 is now satisfied by a standalone repo-owned rehearsal command.
- Phase 10 plan 02 can document `npm run verify:clean-checkout` as the canonical full rehearsal and position `npm run smoke:pack` as the focused packed-install rerun.

## Self-Check: PASSED

- Found `.planning/phases/10-release-rehearsal-and-checklist/10-01-SUMMARY.md`
- Verified commits `ab00fbd` and `a165adb` exist in git history
- Verified `scripts/smoke/verify-packed-install.sh` rebuilds from a cleaned tree and passes the packed-install proof

---
*Phase: 10-release-rehearsal-and-checklist*
*Completed: 2026-03-31*
