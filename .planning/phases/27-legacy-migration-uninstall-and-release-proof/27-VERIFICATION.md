---
phase: 27-legacy-migration-uninstall-and-release-proof
verified: 2026-04-09T11:28:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 27: Legacy Migration, Uninstall, And Release Proof Verification Report

**Phase Goal:** Migrate existing repos safely and prove docs, uninstall, and smoke verification for the new install model.
**Verified:** 2026-04-09T11:28:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Legacy repo-local setups still migrate cleanly to the shared-runtime/minimal-artifact model without losing init, refresh, publish, status, doctor, or uninstall behavior. | ✓ VERIFIED | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` passed. |
| 2 | Migration cleanup preserves user-owned manifest content and custom hook lines while removing only managed legacy runtime markers. | ✓ VERIFIED | `packages/core/src/init/runtime-wiring.test.ts` still contains the ownership-preserving assertions and hook-preservation scenarios; `packages/agent-badge/src/commands/uninstall.test.ts` keeps `echo custom-check` while removing both shared and legacy managed hook blocks. |
| 3 | First shared publish or refresh on a legacy repo still reports `Migration: legacy -> shared`, and legacy recovery guidance stays intact. | ✓ VERIFIED | `packages/agent-badge/src/commands/init.test.ts`, `publish.test.ts`, and `refresh.test.ts` all contain `Migration: legacy -> shared`; `status.test.ts` and `doctor.test.ts` still cover `legacy-no-contributors` and original-publisher-machine recovery wording. |
| 4 | The default doc story now describes `npm init agent-badge@latest` as the shared-runtime/global-first path with minimal repo artifacts. | ✓ VERIFIED | `README.md`, `docs/INSTALL.md`, `docs/QUICKSTART.md`, `docs/CLI.md`, and `docs/HOW-IT-WORKS.md` now describe the shared runtime as the default and remove the stale repo-local runtime language. |
| 5 | Uninstall, auth, troubleshooting, manual gist, FAQ, and recovery docs now match current reinstall and migration behavior. | ✓ VERIFIED | `docs/UNINSTALL.md` preserves data unless purge flags are set, `docs/AUTH.md` and `docs/TROUBLESHOOTING.md` assume `agent-badge` on `PATH`, and `docs/RECOVERY.md` plus `docs/MANUAL-GIST.md` preserve original-publisher migration guidance. |
| 6 | Docs verification now blocks stale repo-local vocabulary and enforces the shared-runtime wording. | ✓ VERIFIED | `scripts/verify-docs.sh` passed and now includes both fixed-string checks for shared-runtime vocabulary and denylist checks for `repo-local runtime`, `Use the repo-local wrapper...`, and `npx --no-install agent-badge init` in the affected docs. |
| 7 | Published-version registry smoke now certifies the initializer’s minimal-artifact contract instead of requiring repo-local runtime artifacts. | ✓ VERIFIED | `scripts/smoke/verify-registry-install.sh` now checks `.agent-badge/*`, the direct shared hook, and absence of managed runtime manifest ownership after `npm init agent-badge@<version>`; acceptance searches confirmed the old `.bin/agent-badge` and `npx --no-install agent-badge --help` expectations are gone. |
| 8 | Packed-install smoke and release instructions now clearly separate explicit direct-runtime package proof from initializer proof. | ✓ VERIFIED | `scripts/smoke/verify-packed-install.sh`, `scripts/verify-clean-checkout.sh`, and `docs/maintainers/RELEASE.md` now call out packed-install as the direct-runtime proof and registry smoke with `--check-initializer` as the authoritative initializer proof. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `README.md` | Shared-runtime/global-first default onboarding | ✓ VERIFIED | Updated and validated by `npm run docs:check`. |
| `docs/UNINSTALL.md` | Default uninstall behavior and reinstall guidance aligned with current runtime model | ✓ VERIFIED | Documents preserved config/state/remote by default and uses `agent-badge init` as the reinstall path. |
| `scripts/verify-docs.sh` | Fixed-string and denylist enforcement for the new operator vocabulary | ✓ VERIFIED | Passed and contains shared-runtime requirements plus stale-language denylist checks. |
| `scripts/smoke/verify-registry-install.sh` | Initializer smoke proves minimal-artifact contract | ✓ VERIFIED | Bash syntax validated and acceptance searches confirmed the stale repo-local binary assumptions were removed. |
| `scripts/smoke/verify-packed-install.sh` | Direct-runtime package proof remains explicit | ✓ VERIFIED | Bash syntax validated and direct-runtime comments plus binary checks remain present. |
| `docs/maintainers/RELEASE.md` | Release checklist points at the correct published-version initializer smoke | ✓ VERIFIED | Contains `verify-registry-install.sh --check-initializer --write-evidence` and `REGISTRY-SMOKE` guidance. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `docs/CLI.md` | `packages/agent-badge/src/cli/main.ts` | command vocabulary alignment | WIRED | Command surface in docs still matches the existing CLI (`init`, `refresh`, `doctor`, `uninstall`); `packages/agent-badge/src/cli/main.test.ts` passed after the docs rewrite. |
| `docs/UNINSTALL.md` | `packages/agent-badge/src/commands/uninstall.ts` | default uninstall behavior and purge flags | WIRED | The docs quote the real default output lines from `runUninstallCommand()` and keep purge flags aligned. |
| `scripts/smoke/verify-registry-install.sh` | `packages/create-agent-badge/src/index.ts` | published initializer expectations | WIRED | Registry smoke now validates the same minimal-artifact contract proven in `packages/create-agent-badge/src/index.test.ts` and `packages/agent-badge/src/commands/release-readiness-matrix.test.ts`. |
| `docs/maintainers/RELEASE.md` | `scripts/smoke/verify-registry-install.sh` | authoritative initializer smoke command | WIRED | Maintainer docs explicitly point at `verify-registry-install.sh --check-initializer --write-evidence` as the release proof. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Docs contract stays internally consistent | `npm run docs:check` | passed | ✓ PASS |
| CLI/help and source proof stay aligned with the minimal-artifact contract | `npm test -- --run packages/agent-badge/src/cli/main.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/create-agent-badge/src/index.test.ts` | `34 passed` | ✓ PASS |
| Regression gate over Phase 25/26/27 surfaces | `npm test -- --run packages/create-agent-badge/src/index.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts` | `70 passed` | ✓ PASS |
| Smoke scripts remain syntactically valid | `bash -n scripts/smoke/verify-registry-install.sh && bash -n scripts/smoke/verify-packed-install.sh && bash -n scripts/verify-clean-checkout.sh` | passed | ✓ PASS |
| Schema drift gate | `node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" verify schema-drift "27"` | `drift_detected=false` | ✓ PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| --- | --- | --- | --- |
| `MIG-01` | Repositories previously initialized with repo-local runtime wiring can migrate to the new model without losing refresh, publish, status, doctor, or uninstall behavior. | ✓ SATISFIED | Verified by the full legacy migration suite and the unchanged migration-output assertions across init, publish, refresh, status, doctor, and uninstall. |
| `MIG-02` | Docs, help text, uninstall flows, and clean temp verification explicitly cover the global install model and assert the absence of repo-local runtime artifacts by default. | ✓ SATISFIED | Verified by the doc rewrites, `scripts/verify-docs.sh`, registry smoke updates, packed-install separation, and release-proof documentation updates. |

Orphaned requirements: none. All Phase 27 requirement IDs in `.planning/REQUIREMENTS.md` appear in plan frontmatter and are covered by the phase artifacts.

### Code Review Gate

`27-REVIEW.md` status is `clean`. No advisory review findings block phase completion.

### Gaps Summary

No blocking gaps found.

Residual risks:
- The updated registry smoke contract was syntax-checked and acceptance-checked locally, but the full published-version smoke still requires a real release candidate and networked registry access, which is expected for the release-proof surface.

---

_Verified: 2026-04-09T11:28:00Z_
_Verifier: Codex (inline verification after verifier-agent timeout)_
