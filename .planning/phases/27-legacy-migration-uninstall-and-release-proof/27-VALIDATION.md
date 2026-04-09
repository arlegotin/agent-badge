---
phase: 27
slug: legacy-migration-uninstall-and-release-proof
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-09
updated: 2026-04-09
---

# Phase 27 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` fixture and temp-repo integration tests, `docs:check`, and shell smoke scripts |
| **Config file** | root workspace scripts plus `packages/core/src/init/runtime-wiring.test.ts`, `packages/agent-badge/src/commands/init.test.ts`, `packages/agent-badge/src/commands/uninstall.test.ts`, `packages/agent-badge/src/commands/status.test.ts`, `packages/agent-badge/src/commands/doctor.test.ts`, `packages/agent-badge/src/commands/refresh.test.ts`, `packages/agent-badge/src/commands/publish.test.ts`, `packages/agent-badge/src/commands/release-readiness-matrix.test.ts`, and `packages/create-agent-badge/src/index.test.ts` |
| **Quick run command** | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` |
| **Full suite command** | `npm run docs:check && npm run typecheck && npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/create-agent-badge/src/index.test.ts && bash -n scripts/smoke/verify-registry-install.sh && bash -n scripts/smoke/verify-packed-install.sh` |
| **Estimated runtime** | ~60-120 seconds for local suite work, plus manual published-version smoke time |

---

## Sampling Rate

- **After legacy migration or uninstall changes:** Run the quick test command and the specific command tests that changed before touching docs or smoke proof.
- **After publish, refresh, status, or doctor wording changes:** Re-run `init`, `publish`, `refresh`, `status`, and `doctor` tests together so migration messaging stays aligned.
- **After docs or help-text changes:** Run `npm run docs:check` and re-read the fixed output examples tied to the changed pages.
- **After smoke-script changes:** Run `bash -n scripts/smoke/verify-registry-install.sh` and `bash -n scripts/smoke/verify-packed-install.sh` immediately, then rerun the release-readiness or initializer tests they depend on.
- **Before `/gsd-verify-work`:** Full suite must be green and the initializer path must have one manual or release-environment smoke proof recorded for a real published version.
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | MIG-01 | T-27-01-01 | Legacy repo-local package scripts, dependency ownership, and hook blocks converge to the shared-runtime or minimal-artifact contract without breaking init, refresh, publish, status, doctor, or uninstall behavior | integration + regression | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/publish.test.ts` | ✅ | ✅ green |
| 27-02-01 | 02 | 2 | MIG-02 | T-27-02-01 | README, docs, uninstall guidance, and command-help examples describe the shared-runtime or global-first model and no longer instruct npm-init users to rely on repo-local wrappers by default | docs + regression | `npm run docs:check && npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` | ✅ | ✅ green |
| 27-03-01 | 03 | 3 | MIG-02 | T-27-03-01 | Release smoke proof distinguishes direct runtime installation from initializer proof and asserts that `npm init agent-badge@latest` does not create repo-local runtime artifacts by default | smoke + regression | `npm test -- --run packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/create-agent-badge/src/index.test.ts && bash -n scripts/smoke/verify-registry-install.sh && bash -n scripts/smoke/verify-packed-install.sh` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠ flaky*

---

## Wave 0 Requirements

- [x] Existing Vitest fixtures already cover the migration-sensitive seams for init, publish, refresh, status, doctor, uninstall, and repo-wiring cleanup.
- [x] Existing docs verification and smoke scripts are sufficient infrastructure; they need expectation updates, not new frameworks.
- [x] Real published-version registry smoke still requires a release candidate version and networked npm resolution. Treat that as a manual or release-environment proof step, not a purely local gate.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirm a legacy single-writer repo migrates from the original publisher machine without changing the stable badge URL or losing shared publish continuity | MIG-01 | The repo's trusted local history and original-publisher state live on a specific machine and cannot be simulated completely in fixture tests | In a repo that previously published under legacy mode, run `agent-badge init` on the original publisher machine first, then run `agent-badge status`, `agent-badge doctor`, `agent-badge refresh`, and `agent-badge uninstall`. Verify `Migration: legacy -> shared` appears on first shared publish where applicable, the gist id and badge URL stay stable, status or doctor no longer report unresolved legacy migration health, and repo-local runtime ownership is absent afterward. |
| Confirm the published initializer leaves minimal repo artifacts by default in a clean temp directory | MIG-02 | This requires a real published version and live npm resolution rather than local source-tree assumptions | Run `bash scripts/smoke/verify-registry-install.sh --version <release-version> --check-initializer --write-evidence --phase-dir artifacts/releases/<release-version> --artifact-prefix REGISTRY-SMOKE`, then inspect the initializer temp repo. Verify `.agent-badge/config.json`, `.agent-badge/state.json`, and the managed `pre-push` hook exist, but repo-local runtime ownership does not: no required `node_modules/.bin/agent-badge` contract, no managed `package.json#scripts.agent-badge:*`, and no managed `@legotin/agent-badge` dependency added by default. |

---

## Validation Audit Results

- `2026-04-09`: Re-ran the full legacy migration regression suite successfully: `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` passed.
- `2026-04-09`: Re-ran docs and release-proof verification successfully: `npm run docs:check`, `npm test -- --run packages/agent-badge/src/cli/main.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/create-agent-badge/src/index.test.ts`, and `bash -n scripts/smoke/verify-registry-install.sh && bash -n scripts/smoke/verify-packed-install.sh && bash -n scripts/verify-clean-checkout.sh` all passed.
- `2026-04-09`: Re-ran the focused cross-phase regression gate successfully: `npm test -- --run packages/create-agent-badge/src/index.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts` passed with `70/70` tests green.
- `2026-04-09`: Schema drift verification passed with `drift_detected=false` and `blocking=false`.

---

## Validation Sign-Off

- [x] All planned tasks have `<automated>` verify or explicit manual-only coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all required verification infrastructure
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
