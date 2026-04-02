---
phase: 18
slug: auth-hook-and-publish-readiness-hardening
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/publish/publish-target.test.ts packages/core/src/publish/publish-state.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~45-90 seconds depending on scenario-matrix breadth |

---

## Sampling Rate

- **After state schema or scaffold changes:** Run `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts`
- **After publish readiness or verification changes:** Run `npm test -- --run packages/core/src/publish/publish-target.test.ts packages/core/src/publish/publish-state.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts`
- **After hook or automation-policy changes:** Run `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/doctor.test.ts`
- **After gap-closure test contract changes:** Run `npm test -- --run packages/core/src/publish/shared-badge-aggregation.test.ts`
- **After every plan wave:** Run `npm test -- --run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | AUTH-01, AUTH-02 | state + readiness classification unit/integration | `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/publish/publish-target.test.ts packages/core/src/publish/publish-state.test.ts packages/core/src/publish/publish-service.test.ts` | ✅ | ✅ green |
| 18-01-02 | 01 | 1 | AUTH-01, AUTH-02 | command + diagnostics integration | `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/doctor.test.ts` | ✅ | ✅ green |
| 18-02-01 | 02 | 2 | CTRL-01, OPER-03 | config + hook wiring integration | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/config.test.ts` | ✅ | ✅ green |
| 18-02-02 | 02 | 2 | CTRL-01, OPER-03 | pre-push degraded-mode and scenario integration | `npm test -- --run packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts` | ✅ | ✅ green |
| 18-03-01 | 03 | 3 | AUTH-01, AUTH-02 | shared publish regression contract repair | `npm test -- --run packages/core/src/publish/shared-badge-aggregation.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Extend `packages/core/src/state/state-schema.test.ts` for any expanded publish failure-code and automation-policy schema values
- [x] Extend `packages/core/src/init/scaffold.test.ts` so init reruns preserve every new Phase 18 readiness field or config value
- [x] Extend `packages/core/src/publish/publish-target.test.ts` and `packages/core/src/publish/publish-service.test.ts` for auth-missing, gist-unreachable, write-failed, and readback-mismatch branches
- [x] Extend `packages/agent-badge/src/commands/publish.test.ts`, `packages/agent-badge/src/commands/refresh.test.ts`, and `packages/core/src/diagnostics/doctor.test.ts` so every readiness code has operator-visible messaging and remediation
- [x] Extend `packages/core/src/init/runtime-wiring.test.ts` and `packages/agent-badge/src/commands/config.test.ts` so managed hook behavior remains idempotent while policy becomes explicit
- [x] Extend `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` with degraded/no-auth/hook-policy scenarios that prove operators cannot mistake a stale badge for a successful pre-push refresh

---

## Manual-Only Verifications

All phase behaviors should have automated verification. No manual-only checks are required at planning time.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** passed on 2026-04-02 after the targeted Phase 18 task suites and the full `npm test -- --run` sweep succeeded; manual UAT remains tracked separately in `18-UAT.md`.
