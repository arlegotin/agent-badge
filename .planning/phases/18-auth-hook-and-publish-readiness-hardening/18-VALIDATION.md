---
phase: 18
slug: auth-hook-and-publish-readiness-hardening
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
updated: 2026-04-05
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run packages/core/src/publish/publish-readiness.test.ts packages/core/src/publish/publish-target.test.ts packages/agent-badge/src/commands/refresh.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15-30 seconds for the quick run; full suite remains longer depending on scenario-matrix breadth |

---

## Sampling Rate

- **After core failure-code or scaffold changes:** Run `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/publish/publish-readiness.test.ts packages/core/src/publish/publish-target.test.ts packages/core/src/publish/publish-state.test.ts`
- **After publish readback verification changes:** Run `npm test -- --run packages/core/src/publish/publish-service.test.ts`
- **After command-surface readiness wording changes:** Run `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts`
- **After hook-policy plumbing or degraded hook UX changes:** Run `npm test -- --run packages/core/src/runtime/local-cli.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/cli/main.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts`
- **After shared publish regression changes:** Run `npm test -- --run packages/core/src/publish/shared-badge-aggregation.test.ts`
- **After every plan wave:** Run `npm test -- --run packages/core/src/publish/publish-readiness.test.ts packages/core/src/publish/publish-target.test.ts packages/agent-badge/src/commands/refresh.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds for per-wave smoke; full suite remains the pre-UAT gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | AUTH-01, AUTH-02 | readiness contract + target classification integration | `npm test -- --run packages/core/src/publish/publish-readiness.test.ts packages/core/src/publish/publish-target.test.ts` | ✅ | ✅ green |
| 18-01-02 | 01 | 1 | AUTH-01, AUTH-02 | schema + scaffold + persisted state migration integration | `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/publish/publish-state.test.ts` | ✅ | ✅ green |
| 18-02-01 | 02 | 2 | AUTH-01 | diagnostics + init remediation integration | `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/init.test.ts` | ✅ | ✅ green |
| 18-02-02 | 02 | 2 | AUTH-01, AUTH-02 | publish + normal refresh readiness integration | `npm test -- --run packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts` | ✅ | ✅ green |
| 18-03-01 | 03 | 3 | CTRL-01 | CLI + managed hook wiring integration | `npm test -- --run packages/core/src/runtime/local-cli.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/cli/main.test.ts` | ✅ | ✅ green |
| 18-03-02 | 03 | 3 | OPER-03, CTRL-01 | degraded hook-mode UX + scenario integration | `npm test -- --run packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts` | ✅ | ✅ green |
| 18-04-01 | 04 | 4 | AUTH-02 | shared publish regression contract repair | `npm test -- --run packages/core/src/publish/shared-badge-aggregation.test.ts` | ✅ | ✅ green |
| 18-04-02 | 04 | 4 | AUTH-01, AUTH-02 | publish readback verification + live auth-failure integration | `npm test -- --run packages/core/src/publish/publish-service.test.ts packages/agent-badge/src/commands/publish.test.ts` | ✅ | ✅ green |
| 18-04-03 | 04 | 4 | AUTH-01 | normal refresh degraded-summary integration | `npm test -- --run packages/agent-badge/src/commands/refresh.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Extend `packages/core/src/state/state-schema.test.ts` and `packages/core/src/init/scaffold.test.ts` so expanded publish failure codes remain migration-safe on init reruns
- [x] Extend `packages/core/src/publish/publish-readiness.test.ts`, `packages/core/src/publish/publish-target.test.ts`, and `packages/core/src/publish/publish-service.test.ts` for auth-missing, gist-target, and readback-failure classification
- [x] Extend `packages/core/src/diagnostics/doctor.test.ts`, `packages/agent-badge/src/commands/init.test.ts`, `packages/agent-badge/src/commands/publish.test.ts`, and `packages/agent-badge/src/commands/refresh.test.ts` so canonical readiness wording is operator-visible across surfaces
- [x] Extend `packages/core/src/runtime/local-cli.test.ts`, `packages/core/src/init/runtime-wiring.test.ts`, and `packages/agent-badge/src/cli/main.test.ts` so managed hook policy is explicit and idempotent
- [x] Extend `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` with no-auth, fail-soft, and strict scenarios that prove degraded pre-push runs cannot be mistaken for successful badge updates
- [x] Extend `packages/core/src/publish/shared-badge-aggregation.test.ts` so shared publish regression coverage matches the current badge -> contributor -> overrides gist write order

---

## Manual-Only Verifications

All phase behaviors should have automated verification. No manual-only checks are required at planning time.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Per-wave smoke latency <= 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** updated on 2026-04-05 after the revised Phase 18 plan split into four plans and nine tasks; the validation map now matches the current Plan 01-04 layout and keeps the full `npm test -- --run` sweep as the final gate before human UAT.
