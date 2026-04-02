---
phase: 17
slug: publish-failure-visibility-and-state-trust
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-02
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/publish-trust.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~30-60 seconds depending on publish-service and command test breadth |

---

## Sampling Rate

- **After state-schema or scaffold reconciliation changes:** Run `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts`
- **After publish-service or publish-trust core changes:** Run `npm test -- --run packages/core/src/publish/publish-service.test.ts packages/core/src/publish/publish-trust.test.ts`
- **After doctor or command-surface wording changes:** Run `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts`
- **After every plan wave:** Run `npm test -- --run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | OPER-01 | core trust derivation unit | `npm test -- --run packages/core/src/publish/publish-trust.test.ts` | ✅ | ⬜ pending |
| 17-01-02 | 01 | 1 | OPER-01 | command-surface integration | `npm test -- --run packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts` | ✅ | ⬜ pending |
| 17-02-01 | 02 | 2 | OPER-01, OPER-02 | state + publish persistence integration | `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/publish/publish-service.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts` | ✅ | ⬜ pending |
| 17-03-01 | 03 | 3 | OPER-01, OPER-02 | canonical trust derivation unit | `npm test -- --run packages/core/src/publish/publish-trust.test.ts` | ✅ | ⬜ pending |
| 17-03-02 | 03 | 3 | OPER-01, OPER-02 | doctor + shared trust vocabulary integration | `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/doctor.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Add `publish-trust` fixtures for no publish attempt, unchanged sync, current badge, stale after failed publish, and failed-but-unchanged candidate badge
- [ ] Extend `packages/core/src/state/state-schema.test.ts` for all new additive publish diagnostic defaults and privacy-safe failure-code parsing
- [ ] Extend `packages/core/src/init/scaffold.test.ts` so init reruns preserve every Phase 17 publish diagnostic field
- [ ] Extend `packages/core/src/publish/publish-service.test.ts` for pre-write candidate-hash derivation and unchanged-vs-changed badge semantics
- [ ] Extend `packages/agent-badge/src/commands/publish.test.ts` and `packages/agent-badge/src/commands/refresh.test.ts` so both write paths persist the same canonical publish-attempt contract
- [ ] Extend `packages/core/src/diagnostics/doctor.test.ts`, `packages/agent-badge/src/commands/status.test.ts`, and `packages/agent-badge/src/commands/doctor.test.ts` so live-badge trust vocabulary stays aligned while shared-health remains separate

---

## Manual-Only Verifications

All phase behaviors should have automated verification. No manual-only checks are required at planning time.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
