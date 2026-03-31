---
phase: 09-package-metadata-and-tarball-integrity
plan: 02
subsystem: packaging
tags: [npm, tarball, smoke, release, verification]
requires:
  - phase: 09-package-metadata-and-tarball-integrity
    provides: deliberate `1.1.0` package metadata and publishable dependency ranges
provides:
  - repo-owned tarball-content enforcement for publishable packages
  - explicit required runtime entrypoint checks for CLI and library artifacts
  - clean-checkout verification text that treats pack validation as a gate before smoke install
affects: [release-packaging, verify-clean-checkout, PACK-02]
tech-stack:
  added: []
  patterns: [allowlist-based tarball verification, isolated-cache packed-install smoke checks]
key-files:
  created:
    - .planning/phases/09-package-metadata-and-tarball-integrity/09-02-SUMMARY.md
    - scripts/check-packages.mjs
  modified:
    - package.json
    - scripts/verify-clean-checkout.sh
key-decisions:
  - "Tarball verification should be a repo-owned script that parses `npm pack --dry-run --json` output rather than a shell chain of dry-run commands."
  - "Publishable tarballs may contain only `dist/**` plus `package.json`, and they must include explicit runtime entrypoints before the smoke-install step runs."
patterns-established:
  - "Pack validation should fail on unexpected content and missing runtime entrypoints before any broader release rehearsal proceeds."
  - "The clean-checkout verifier should keep pack validation distinct from packed-install smoke validation so failures stay diagnosable."
requirements-completed: [PACK-02]
duration: 1 plan commit
completed: 2026-03-31
---

# Phase 09 Plan 02: Package Metadata and Tarball Integrity Summary

**Strict tarball-content gate with explicit runtime entrypoint checks and clean-checkout reuse before packed-install smoke verification**

## Accomplishments

- Added `scripts/check-packages.mjs` as a deterministic pack checker that shells out to `npm pack --workspace ... --dry-run --json`, rejects any non-`dist/**` file other than `package.json`, and requires the runtime entrypoints each publishable package must ship.
- Replaced the root `pack:check` shell chain with the repo-owned checker so tarball integrity is enforced through one reusable command.
- Clarified `scripts/verify-clean-checkout.sh` so tarball integrity is called out as a gate before the broader packed-install smoke run.
- Verified the stricter gate locally with `npm run pack:check`, then proved the packed-install flow and the full clean-checkout path from current source.

## Task Commits

1. **Combined plan implementation** - `42740a6` (`feat`)

## Verification

- `npm_config_cache=/tmp/agent-badge-npm-cache npm run pack:check`
- `bash scripts/smoke/verify-packed-install.sh`
- `bash scripts/verify-clean-checkout.sh`

## Files Created/Modified

- `scripts/check-packages.mjs` - Enforces the tarball allowlist and required runtime entrypoints for all three publishable packages.
- `package.json` - Routes `pack:check` through the repo-owned checker.
- `scripts/verify-clean-checkout.sh` - Documents the ordering between the tarball gate and the packed-install smoke gate.

## Decisions Made

- Kept the pack gate narrow and explicit: allow only `dist/**` plus `package.json`, then separately require the CLI and library entrypoints each package must publish.
- Left the packed-install smoke proof as a distinct step after `pack:check` so tarball-surface regressions and install-time regressions remain easy to distinguish.

## Deviations from Plan

- The first sandboxed smoke-pack run stalled during `npm install`; the verification was rerun outside the sandbox so the dependency install could complete normally.
- As with `09-01`, the shared `gsd-tools` binary was unavailable, so this plan used the same execution order manually and recorded the artifacts afterward.

## Issues Encountered

- Sandboxed dependency installation could not complete the packed-install smoke check. Re-running `bash scripts/smoke/verify-packed-install.sh` outside the sandbox resolved the environment constraint and passed.

## Next Phase Readiness

- PACK-02 is satisfied from committed source.
- Phase 10 can focus on the final release rehearsal and constrained-environment checklist rather than fixing package metadata or tarball-surface regressions.

## Self-Check: PASSED

- Found `.planning/phases/09-package-metadata-and-tarball-integrity/09-02-SUMMARY.md`
- Found `scripts/check-packages.mjs`
- Verified commit `42740a6` exists in git history

---
*Phase: 09-package-metadata-and-tarball-integrity*
*Completed: 2026-03-31*
