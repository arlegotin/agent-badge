---
phase: 10-release-rehearsal-and-checklist
verified: 2026-03-31T13:11:16Z
status: passed
score: 3/3 must-haves verified
human_verification: []
---

# Phase 10: Release Rehearsal and Checklist Verification Report

**Phase Goal:** The release path is proven end to end on a constrained developer machine and documented as one repeatable sequence.
**Verified:** 2026-03-31T13:11:16Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Maintainers can install the locally packed tarballs into a clean temporary project and invoke both exported CLIs successfully. | ✓ VERIFIED | `scripts/smoke/verify-packed-install.sh` now rebuilds before packing, resolves the exact `agent-badge-core`, `agent-badge`, and `create-agent-badge` tarballs, prints the scratch paths and tarball basenames, verifies `import('agent-badge')`, verifies `import('create-agent-badge')`, and runs both installed CLI `--help` commands. The cleaned-tree command `find packages -type d -name dist -prune -exec rm -rf {} + && find packages -type f -name '*.tsbuildinfo' -delete && npm_config_cache=/tmp/agent-badge-npm-cache bash scripts/smoke/verify-packed-install.sh` passed. |
| 2 | Maintainers can follow one documented checklist to reproduce the release rehearsal on constrained machines. | ✓ VERIFIED | `docs/RELEASE.md` is now the single maintainer-facing checklist. It requires `npm run docs:check`, `npm run typecheck`, and `npm run verify:clean-checkout`, explains `/tmp` scratch-space usage plus `npm_config_cache`, and positions `npm run smoke:pack` as the focused rerun when the packed-install proof itself fails. `README.md` links to the checklist as `Release Checklist`, and `scripts/verify-docs.sh` enforces both the file and its required strings. |
| 3 | The same checklist includes the final package-name verification and publish command in one place. | ✓ VERIFIED | `docs/RELEASE.md` documents the live `npm view agent-badge name version`, `npm view create-agent-badge name version`, and `npm view @agent-badge/core name version` checks immediately before publish, explicitly calling out that registry state observed on 2026-03-31 is time-sensitive. The same checklist then routes maintainers to `npm run release`. |

**Score:** 3/3 truths verified

### Plan Completion Evidence

| Plan | Status | Evidence |
| --- | --- | --- |
| 10-01 | Complete | Commits `ab00fbd` and `a165adb`; summary `.planning/phases/10-release-rehearsal-and-checklist/10-01-SUMMARY.md` |
| 10-02 | Complete | Commits `fdc360e`, `580e472`, and `025da5b`; summary `.planning/phases/10-release-rehearsal-and-checklist/10-02-SUMMARY.md` |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `scripts/smoke/verify-packed-install.sh` | Standalone packed-install proof with exact tarball selection and diagnostics | ✓ VERIFIED | Script contains `npm run build`, exact tarball resolution variables, diagnostic `printf` output, import checks for `agent-badge` and `create-agent-badge`, and both CLI help checks. |
| `scripts/verify-clean-checkout.sh` | Canonical full release rehearsal | ✓ VERIFIED | Clean-checkout verifier clears `dist/` and `*.tsbuildinfo`, then runs `npm run build`, `npm test -- --run`, `npm run pack:check`, and `npm run smoke:pack` with an isolated npm cache under a temp directory. |
| `docs/RELEASE.md` | Single maintainer-facing release checklist | ✓ VERIFIED | Checklist includes the required docs/typecheck/clean-checkout gates, constrained-machine `/tmp` and `npm_config_cache` guidance, the focused `npm run smoke:pack` rerun, the three live `npm view` checks, and `npm run release`. |
| `README.md` | Discoverable link to the release checklist | ✓ VERIFIED | Documentation section now links `Release Checklist` to `docs/RELEASE.md`. |
| `scripts/verify-docs.sh` | Deterministic enforcement for the release checklist | ✓ VERIFIED | Script now requires `docs/RELEASE.md`, verifies the README link, and asserts the critical release-checklist strings via `rg -n`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `package.json` | `scripts/smoke/verify-packed-install.sh` | `smoke:pack` script entrypoint | ✓ WIRED | Root `smoke:pack` continues delegating to the repo-owned packed-install rehearsal. |
| `scripts/verify-clean-checkout.sh` | `package.json` | `npm run smoke:pack` | ✓ WIRED | Clean-checkout verification composes the standalone smoke rehearsal as the final release-proof step. |
| `README.md` | `docs/RELEASE.md` | Documentation index link | ✓ WIRED | README exposes the checklist as a maintainer-facing doc. |
| `scripts/verify-docs.sh` | `docs/RELEASE.md` | required file plus exact content checks | ✓ WIRED | Docs gate protects the release checklist contract from drift. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Standalone packed-install rehearsal from a cleaned tree | `find packages -type d -name dist -prune -exec rm -rf {} + && find packages -type f -name '*.tsbuildinfo' -delete && npm_config_cache=/tmp/agent-badge-npm-cache bash scripts/smoke/verify-packed-install.sh` | Build ran first, exact tarballs were resolved, both imports passed, both CLI help checks passed | ✓ PASS |
| Release checklist docs gate | `npm run docs:check` | README link and all required release-checklist strings verified successfully | ✓ PASS |
| Full clean-checkout release rehearsal | `npm run verify:clean-checkout` | Build passed, 33 files / 172 tests passed, `pack:check` passed, and the packed-install smoke proof passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `PACK-03` | `10-01-PLAN.md` | Maintainer can install the locally packed tarballs in a clean temporary project and invoke both exported CLIs successfully. | ✓ SATISFIED | `scripts/smoke/verify-packed-install.sh` rebuilds before packing, resolves exact tarballs, proves both imports plus both CLI help surfaces, and passed from a cleaned tree. |
| `OPER-06` | `10-02-PLAN.md` | Maintainer can follow one documented release checklist that covers isolated npm cache usage, workspace disk constraints, and npm package-name verification before publish. | ✓ SATISFIED | `docs/RELEASE.md` contains the canonical release sequence, constrained-machine guidance, all three live `npm view` checks, and `npm run release`; `README.md` links to it and `scripts/verify-docs.sh` enforces it. |

Phase 10 requirement IDs match the Phase 10 traceability entries in `.planning/REQUIREMENTS.md`; no orphaned Phase 10 requirements were found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No remaining blocker-level Phase 10 anti-patterns were found in the packed-install or release-checklist path. | - | No blocker or warning-level anti-patterns found. |

### Human Verification Required

None. This phase's deliverables are fully evidenced by committed scripts, docs, and automated command results. The publish-time `npm view` commands remain intentionally documented as live operator preflight, not frozen verification facts.

### Gaps Summary

No remaining Phase 10 gaps were found. The packed-install proof and the constrained-environment release checklist are both present and verified from current source.

---

_Verified: 2026-03-31T13:11:16Z_
_Verifier: Codex inline fallback_
