---
phase: 25
slug: global-runtime-contract-and-command-resolution
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-08
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` temp-repo integration tests plus `tsc -b` typecheck |
| **Config file** | `packages/core/src/runtime/local-cli.test.ts`, `packages/core/src/init/runtime-wiring.test.ts`, `packages/core/src/diagnostics/doctor.test.ts`, command integration tests, and `scripts/smoke/verify-registry-install.sh` for assumption inventory |
| **Quick run command** | `npm test -- --run packages/core/src/runtime/local-cli.test.ts packages/core/src/init/runtime-wiring.test.ts packages/core/src/diagnostics/doctor.test.ts` |
| **Full suite command** | `npm run typecheck && npm test -- --run packages/core/src/runtime/local-cli.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/create-agent-badge/src/index.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts && bash -n scripts/smoke/verify-registry-install.sh` |
| **Estimated runtime** | ~30-90 seconds for repo-owned checks |

---

## Sampling Rate

- **After runtime helper changes:** Run the quick test command and re-read the resolved contract output or helper fixtures.
- **After managed-hook changes:** Re-run `packages/core/src/init/runtime-wiring.test.ts` and `packages/core/src/diagnostics/doctor.test.ts` before touching broader command tests.
- **After init/config/uninstall integration changes:** Run the full suite command to confirm idempotent reruns and managed-entrypoint behavior still converge.
- **After changing any assumption inventory or fallback logic:** Re-run `bash -n scripts/smoke/verify-registry-install.sh` and grep the affected files for old wrapper assumptions before declaring the phase stable.
- **Before `/gsd-verify-work`:** Full suite must be green and the final managed hook contract must be test-covered for both shared-first and compatibility-fallback scenarios.
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | AUTO-01 | runtime contract helper coverage | `npm test -- --run packages/core/src/runtime/local-cli.test.ts packages/core/src/init/runtime-wiring.test.ts` | ⬜ pending | ⬜ pending |
| 25-01-02 | 01 | 1 | DIST-03 | remediation and resolution precedence | `npm test -- --run packages/core/src/runtime/local-cli.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/init.test.ts` | ⬜ pending | ⬜ pending |
| 25-02-01 | 02 | 2 | AUTO-01 | managed hook and command rewiring | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/core/src/diagnostics/doctor.test.ts` | ⬜ pending | ⬜ pending |
| 25-02-02 | 02 | 2 | DIST-03, AUTO-01 | init compatibility and regression matrix | `npm test -- --run packages/create-agent-badge/src/index.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts && bash -n scripts/smoke/verify-registry-install.sh` | ⬜ pending | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing `vitest` temp-repo coverage already exercises runtime wiring, init, config, uninstall, and doctor flows.
- [x] Existing TypeScript project references already catch cross-package contract drift via `npm run typecheck`.
- [x] Existing smoke and docs scripts are sufficient as assumption inventory guardrails for this phase; no new framework is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirming the shared-runtime hook path works in a real operator Git environment that may not inherit a login-shell PATH | DIST-03, AUTO-01 | GUI Git clients and shell-launched Git can expose different PATH behavior that temp-repo unit tests cannot prove on every workstation | In a real repo with a user-scoped `agent-badge` install, run `agent-badge init`, inspect `.git/hooks/pre-push`, then execute the hook or perform a dry-run push from the target Git client environment and confirm the shared runtime is found without repo-local wrapper assumptions. |

---

## Validation Sign-Off

- [x] All planned Phase 25 tasks have `<automated>` verify or explicit manual-only gates
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all needed local verification infrastructure
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
