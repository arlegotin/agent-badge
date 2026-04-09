---
phase: 19
slug: recovery-paths-and-production-reliability-verification
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-05
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/refresh.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~20-40 seconds for the focused phase suites; full suite remains longer depending on scenario-matrix breadth |

---

## Sampling Rate

- **After core recovery-routing changes:** Run `npm test -- --run packages/core/src/publish/publish-readiness.test.ts packages/core/src/publish/publish-trust.test.ts packages/core/src/publish/shared-health.test.ts packages/core/src/diagnostics/doctor.test.ts`
- **After status/doctor recovery-output changes:** Run `npm test -- --run packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts`
- **After mutating recovery-flow changes in init/refresh:** Run `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/refresh.test.ts`
- **After docs or runbook changes:** Run `npm run docs:check`
- **After every plan wave:** Run `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/refresh.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green and the recovery evidence artifact must exist
- **Max feedback latency:** 40 seconds for the focused phase suites; live recovery proof is the explicit long-running gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | CTRL-02 | core recovery-plan routing | `npm test -- --run packages/core/src/publish/publish-readiness.test.ts packages/core/src/publish/publish-trust.test.ts packages/core/src/publish/shared-health.test.ts packages/core/src/diagnostics/doctor.test.ts` | ✅ | ✅ green |
| 19-01-02 | 01 | 1 | CTRL-02 | status/doctor/init/refresh recovery-surface integration | `npm test -- --run packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/refresh.test.ts` | ✅ | ✅ green |
| 19-02-01 | 02 | 2 | CTRL-03 | runbook and operator-doc coherence | `npm run docs:check` | ✅ | ✅ green |
| 19-02-02 | 02 | 2 | CTRL-03 | scripted evidence harness and scenario coverage | `npm test -- --run packages/agent-badge/src/commands/release-readiness-matrix.test.ts && PHASE19_DRY_RUN_DIR=/tmp/agent-badge-phase19-dry-run bash scripts/smoke/verify-recovery-flow.sh --dry-run --phase-dir /tmp/agent-badge-phase19-dry-run && rg -n '"source"|"preRecovery"|"postRecovery"' /tmp/agent-badge-phase19-dry-run/19-RECOVERY-EVIDENCE.json` | ✅ | ✅ green |
| 19-02-03 | 02 | 2 | CTRL-02, CTRL-03 | populated live recovery proof artifacts | `bash scripts/smoke/verify-recovery-flow.sh --phase-dir .planning/phases/19-recovery-paths-and-production-reliability-verification && test -f .planning/phases/19-recovery-paths-and-production-reliability-verification/19-HUMAN-UAT.md && test -f .planning/phases/19-recovery-paths-and-production-reliability-verification/19-RECOVERY-EVIDENCE.json && rg -n 'status: passed|recovery_command: agent-badge|source: scripts/smoke/verify-recovery-flow.sh|Shared mode: shared \\| health=healthy' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-HUMAN-UAT.md && rg -n '"status": "passed"|"postRecovery"|"source": "scripts/smoke/verify-recovery-flow.sh"' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-RECOVERY-EVIDENCE.json` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Add or extend focused tests for canonical recovery routing across publish-readiness, publish-trust, and shared-health inputs
- [x] Extend `packages/core/src/diagnostics/doctor.test.ts` and `packages/agent-badge/src/commands/status.test.ts` so the supported recovery path is asserted exactly, not approximately
- [x] Extend `packages/agent-badge/src/commands/init.test.ts` and `packages/agent-badge/src/commands/refresh.test.ts` so successful repair flows prove error-state recovery without manual state edits
- [x] Add or extend phase-owned evidence capture for the stale failed-publish path and the recovered healthy state
- [x] Ensure the live recovery proof writes populated Markdown and JSON evidence artifacts, not only empty templates
- [x] Keep doc verification on the repo-owned `npm run docs:check` entrypoint instead of ad-hoc grep commands

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real stale badge recovery against this repo's configured gist | CTRL-02, CTRL-03 | Requires real local state, real auth/gist environment, and the actual operator-facing command output | Capture the failing `status` and `doctor` output, restore auth, run the supported recovery command sequence, then capture the recovered `status` and `doctor` output plus the populated phase evidence artifacts |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Focused phase-suite latency <= 40s
- [x] `nyquist_compliant: true` set in frontmatter after the plan/task map is finalized

**Approval:** complete
