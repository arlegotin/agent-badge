---
phase: 25-global-runtime-contract-and-command-resolution
verified: 2026-04-08T20:49:09Z
status: passed
score: 6/6 must-haves verified
---

# Phase 25: Global Runtime Contract And Command Resolution Verification Report

**Phase Goal:** Define the runtime discovery and invocation contract used by init, refresh, config, uninstall, and managed hooks without relying on repo-local binaries.
**Verified:** 2026-04-08T20:49:09Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Core runtime command builders and generated hook entrypoints no longer depend on `npx --no-install`, package-manager exec wrappers, or `node_modules/.bin`. | ✓ VERIFIED | `packages/core/src/runtime/shared-cli.ts` and `packages/core/src/runtime/local-cli.ts` build plain `agent-badge ...` commands; `packages/core/src/init/runtime-wiring.ts` writes direct hook bodies; the focused Vitest suite passed with `91` tests across runtime wiring and package-manager matrix coverage. |
| 2 | The CLI can detect whether a shared `agent-badge` runtime is available and emits actionable, privacy-safe remediation when it is not. | ✓ VERIFIED | `inspectSharedRuntime()` probes `agent-badge --version` in `packages/core/src/runtime/shared-cli.ts`; remediation text stays install-and-PATH oriented; `packages/core/src/runtime/shared-cli.test.ts` and command-surface tests passed. |
| 3 | Managed hooks are shared-runtime-first while diagnostics stay migration-safe for legacy hook bodies. | ✓ VERIFIED | `packages/core/src/init/runtime-wiring.ts` guards `command -v agent-badge` and emits direct refresh commands; `packages/core/src/diagnostics/doctor.ts` still accepts legacy `agent-badge:refresh` markers and now warns if direct hooks omit the PATH guard or use the wrong guard exit semantics; `packages/core/src/diagnostics/doctor.test.ts` passed. |
| 4 | Init, config, and status expose one consistent `Shared runtime:` contract to operators without overstating readiness when the runtime is unavailable. | ✓ VERIFIED | `packages/agent-badge/src/commands/init.ts`, `packages/agent-badge/src/commands/config.ts`, and `packages/agent-badge/src/commands/status.ts` all consume the shared runtime probe/remediation path, and init now stops short of claiming the setup is fully ready when the shared runtime is still missing or broken. |
| 5 | Compatibility proof enforces the direct shared hook contract across npm, pnpm, Yarn, and Bun without breaking uninstall or migration cleanup. | ✓ VERIFIED | `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` passed for all supported package-manager contexts; `packages/agent-badge/src/commands/uninstall.test.ts` passed for both direct and legacy managed hook cleanup while preserving custom lines. |
| 6 | The artifact boundary also enforces the shared hook contract, so the phase is not relying on unit tests alone. | ✓ VERIFIED | `scripts/smoke/verify-registry-install.sh` now asserts the generated hook contract directly and passed `bash -n`; plan-level artifact and key-link verification both returned all-pass results for `25-01` and `25-02`. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/core/src/runtime/shared-cli.ts` | Shared runtime probe, remediation, and direct command builder | ✓ VERIFIED | `gsd-tools verify artifacts` for `25-01-PLAN.md` reported `all_passed: true`. |
| `packages/core/src/init/runtime-wiring.ts` | Managed hook writer on the direct shared contract | ✓ VERIFIED | `gsd-tools verify artifacts` for `25-01-PLAN.md` reported `all_passed: true`. |
| `packages/core/src/diagnostics/doctor.ts` | Dual-read diagnostics and shared remediation usage | ✓ VERIFIED | `gsd-tools verify artifacts` for `25-01-PLAN.md` reported `all_passed: true`. |
| `packages/agent-badge/src/commands/init.ts` | Init-time shared runtime reporting | ✓ VERIFIED | `gsd-tools verify artifacts` for `25-02-PLAN.md` reported `all_passed: true`. |
| `packages/agent-badge/src/commands/config.ts` | Config-time shared runtime reporting | ✓ VERIFIED | `gsd-tools verify artifacts` for `25-02-PLAN.md` reported `all_passed: true`. |
| `packages/agent-badge/src/commands/status.ts` | Status-time shared runtime reporting | ✓ VERIFIED | `gsd-tools verify artifacts` for `25-02-PLAN.md` reported `all_passed: true`. |
| `scripts/smoke/verify-registry-install.sh` | Smoke-level contract assertion for the managed hook | ✓ VERIFIED | `gsd-tools verify artifacts` for `25-02-PLAN.md` reported `all_passed: true`; `bash -n` passed. |

**Artifacts:** 7/7 verified

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/init/runtime-wiring.ts` | `packages/core/src/runtime/shared-cli.ts` | `createManagedHookBlock` | ✓ VERIFIED | `gsd-tools verify key-links` for `25-01-PLAN.md` reported the pattern present in source. |
| `packages/core/src/diagnostics/doctor.ts` | `packages/core/src/runtime/shared-cli.ts` | shared remediation helper | ✓ VERIFIED | `gsd-tools verify key-links` for `25-01-PLAN.md` reported the pattern present in source. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/runtime/shared-cli.ts` | shared runtime inspection and remediation formatting | ✓ VERIFIED | `gsd-tools verify key-links` for `25-02-PLAN.md` reported the pattern present in source. |
| `packages/agent-badge/src/commands/status.ts` | `packages/core/src/runtime/shared-cli.ts` | status reporting | ✓ VERIFIED | `gsd-tools verify key-links` for `25-02-PLAN.md` reported the pattern present in source. |
| `scripts/smoke/verify-registry-install.sh` | `.git/hooks/pre-push` | generated hook assertion | ✓ VERIFIED | `gsd-tools verify key-links` for `25-02-PLAN.md` reported the pattern present in source. |

**Wiring:** 5/5 connections verified

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 25 review fixes hold on the directly affected surfaces | `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/core/src/diagnostics/doctor.test.ts` | Exit `0`; `2` test files and `28` tests passed. | ✓ PASS |
| Phase 25 runtime, hook, operator, uninstall, and compatibility regressions still hold after the fixes | `npm test -- --run packages/core/src/runtime/shared-cli.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/create-agent-badge/src/index.test.ts` | Exit `0`; `7` test files and `60` tests passed. | ✓ PASS |
| The stable local command-builder contract still matches the shared-runtime model | `npm test -- --run packages/core/src/runtime/local-cli.test.ts` | Exit `0`; `1` test file and `4` tests passed. | ✓ PASS |
| The smoke verifier remains syntactically valid after adding shared-hook contract assertions | `bash -n scripts/smoke/verify-registry-install.sh` | Exit `0`. | ✓ PASS |
| Plan 25-01 artifacts and links satisfy their declared contract | `gsd-tools verify artifacts ...25-01-PLAN.md` and `gsd-tools verify key-links ...25-01-PLAN.md` | Both exited `0`; all artifacts passed and all links verified. | ✓ PASS |
| Plan 25-02 artifacts and links satisfy their declared contract | `gsd-tools verify artifacts ...25-02-PLAN.md` and `gsd-tools verify key-links ...25-02-PLAN.md` | Both exited `0`; all artifacts passed and all links verified. | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `DIST-03` | `25-01`, `25-02` | Init and normal commands explain how to satisfy the shared CLI prerequisite when a usable global or user-scoped runtime cannot be resolved. | ✓ SATISFIED | `packages/core/src/runtime/shared-cli.ts` defines the canonical remediation text; `packages/agent-badge/src/commands/init.ts`, `packages/agent-badge/src/commands/config.ts`, and `packages/agent-badge/src/commands/status.ts` surface the same `Shared runtime:` messaging; the related tests passed. |
| `AUTO-01` | `25-01`, `25-02` | Managed refresh and other generated repo entrypoints invoke `agent-badge` without relying on repo-local binaries, `npx --no-install`, or package-manager script wiring that exists only to reach a local runtime. | ✓ SATISFIED | `packages/core/src/runtime/local-cli.ts` returns plain `agent-badge` commands, `packages/core/src/init/runtime-wiring.ts` writes direct managed hook bodies, `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` proves the hook contract across npm/pnpm/Yarn/Bun, and the smoke script asserts the generated hook content directly. |

No orphaned Phase 25 requirements were found: both planned requirement IDs from `.planning/REQUIREMENTS.md` are accounted for by the implemented artifacts and passing regression proof.

### Anti-Patterns Found

No blocking anti-patterns found in the Phase 25 code surface. The review and verification passes did not find placeholder wiring, TODO-only paths, legacy-wrapper regressions, or privacy leaks through machine-local executable paths.

### Human Verification Required

None — the phase goal is fully covered by code inspection, artifact/link verification, and automated regression proof.

### Gaps Summary

No gaps found. Phase 25 achieved the goal: runtime discovery and invocation now center on the shared `agent-badge` contract, the managed hook contract no longer depends on repo-local runners, operators get actionable remediation when the shared runtime is unavailable, and the migration path remains safe for legacy hook bodies.

## Verification Metadata

**Verification approach:** Goal-backward using ROADMAP success criteria plus PLAN must-haves  
**Must-haves source:** `.planning/ROADMAP.md`, `25-01-PLAN.md`, `25-02-PLAN.md`  
**Automated checks:** artifact verifier `7/7`, key-link verifier `5/5`, regression suite `92/92`, smoke syntax check `1/1`  
**Human checks required:** `0`

---

_Verified: 2026-04-08T20:49:09Z_
_Verifier: Codex (inline verification)_
