---
phase: 09-package-metadata-and-tarball-integrity
plan: 01
subsystem: packaging
tags: [npm, semver, workspace, lockfile, init]
requires:
  - phase: 08-verification-gate-recovery
    provides: green build, test, and clean-checkout verification from current source
provides:
  - deliberate `1.1.0` versions for all publishable workspace packages
  - publishable internal dependency ranges for the runtime and initializer packages
  - init wiring assertions aligned to the published runtime dependency contract
affects: [09-02, release-packaging, PACK-01]
tech-stack:
  added: []
  patterns: [manifest-derived runtime specifier assertions, publishable workspace semver contracts]
key-files:
  created:
    - .planning/phases/09-package-metadata-and-tarball-integrity/09-01-SUMMARY.md
  modified:
    - packages/core/package.json
    - packages/agent-badge/package.json
    - packages/create-agent-badge/package.json
    - package-lock.json
    - packages/agent-badge/src/commands/init.test.ts
key-decisions:
  - "Publishable workspace packages use deliberate `1.1.0` versions while the lockfile retains npm workspace `file:` links for local development."
  - "Runtime wiring assertions derive the expected specifier from `packages/agent-badge/package.json` and also pin the initializer manifest to `\"agent-badge\": \"^1.1.0\"`."
patterns-established:
  - "Workspace publish metadata should move together with the regression tests that assert repo-local runtime wiring."
  - "Published dependency contracts should be asserted from checked-in manifests, not from placeholder-vs-initializer divergence."
requirements-completed: [PACK-01]
duration: 1 plan commit
completed: 2026-03-31
---

# Phase 09 Plan 01: Package Metadata and Tarball Integrity Summary

**Deliberate `1.1.0` workspace metadata with aligned runtime-wiring assertions for the published install contract**

## Accomplishments

- Replaced placeholder `0.0.0` versions in `@agent-badge/core`, `agent-badge`, and `create-agent-badge` with the deliberate `1.1.0` release contract.
- Updated the runtime package's internal dependency on `@agent-badge/core` and the initializer's dependency on `agent-badge` to the matching `^1.1.0` publishable ranges.
- Rebased the init regression test so repo-local installs now expect the published runtime specifier and explicitly verify the initializer manifest exposes `"agent-badge": "^1.1.0"`.
- Synchronized the workspace lockfile package entries so the publishable package metadata matches the new release contract without disturbing npm's workspace-link encoding.

## Task Commits

1. **Combined plan implementation** - `96b501d` (`chore`)

## Verification

- `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts`
- `npm run build`
- `bash scripts/verify-clean-checkout.sh`

## Files Created/Modified

- `packages/core/package.json` - Deliberate `1.1.0` package metadata for the core runtime package.
- `packages/agent-badge/package.json` - Deliberate `1.1.0` CLI metadata plus `@agent-badge/core` set to `^1.1.0`.
- `packages/create-agent-badge/package.json` - Deliberate `1.1.0` initializer metadata plus `agent-badge` set to `^1.1.0`.
- `package-lock.json` - Workspace package entries updated to the same publishable version contract.
- `packages/agent-badge/src/commands/init.test.ts` - Runtime wiring assertions now match the deliberate published dependency contract.

## Decisions Made

- Kept the root workspace package private and unchanged while making only the publishable packages deliberate and release-ready.
- Treated the runtime manifest as the source of truth for repo-local install specifiers so the test suite follows the real shipped package metadata.

## Deviations from Plan

- The shared `gsd-tools` binary crashed on startup (`phaseArchiveDir` redeclared in `milestone.cjs`), so this plan was executed through the same ordered steps manually instead of via automated GSD orchestration.
- Both plan tasks landed in one plan-level commit rather than separate task commits because the inline fallback path replaced the broken executor flow.

## Issues Encountered

- `gsd-tools` could not update phase state automatically due the startup syntax error, so summary, roadmap, and state artifacts were updated manually after verification.

## Next Phase Readiness

- PACK-01 is satisfied from committed source.
- Wave 2 can treat the `1.1.0` metadata contract as the baseline for tarball-content enforcement and packed-install verification.

## Self-Check: PASSED

- Found `.planning/phases/09-package-metadata-and-tarball-integrity/09-01-SUMMARY.md`
- Verified commit `96b501d` exists in git history

---
*Phase: 09-package-metadata-and-tarball-integrity*
*Completed: 2026-03-31*
