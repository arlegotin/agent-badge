---
phase: 06
slug: doctor-uninstall-and-safety-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 06 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-06-01 | 01 | 1 | SAFE-03 | unit | `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/doctor.test.ts` | ✅ exists in 06-01 plan | ⬜ pending |
| 6-06-02 | 01 | 1 | SAFE-03 | integration + cli | `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/agent-badge/src/cli/main.test.ts packages/agent-badge/src/commands/scan.test.ts` | ✅ exists in 06-01 plan | ⬜ pending |
| 6-06-03 | 02 | 2 | OPER-05, SAFE-04 | unit + unit/integration | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/core/src/publish/github-gist-client.test.ts packages/core/src/publish/publish-target.test.ts` | ✅ exists in 06-02 plan | ⬜ pending |
| 6-06-04 | 02 | 2 | OPER-05, SAFE-04 | command + integration | `npm test -- --run packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/cli/main.test.ts` | ✅ exists in 06-02 plan | ⬜ pending |
| 6-06-05 | 02 | 2 | SAFE-04 | regression | `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/core/src/init/runtime-wiring.test.ts` | ✅ exists in 06-02 plan | ⬜ pending |
| 6-06-06 | 03 | 3 | SAFE-01, SAFE-02, SAFE-04 | unit | `npm test -- --run packages/core/src/logging/log.test.ts` | ✅ exists in 06-03 plan | ⬜ pending |
| 6-06-07 | 03 | 3 | SAFE-01, SAFE-02, SAFE-04 | command + unit | `npm test -- --run packages/agent-badge/src/commands/scan.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/publish.test.ts` | ✅ exists in 06-03 plan | ⬜ pending |
| 6-06-08 | 03 | 3 | SAFE-01, SAFE-04 | regression + privacy | `npm test -- --run packages/core/src/publish/publish-service.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/init.test.ts` | ✅ exists in 06-03 plan | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/core/src/diagnostics/doctor.test.ts` — doctor diagnostics schema, read-only checks, and optional write probe behavior
- [ ] `packages/agent-badge/src/commands/doctor.test.ts` — JSON mode and formatted output coverage
- [ ] `packages/core/src/init/runtime-wiring.test.ts` — inverse wiring and idempotent removal coverage
- [ ] `packages/core/src/publish/github-gist-client.test.ts` — delete gist client behavior coverage
- [ ] `packages/core/src/publish/publish-target.test.ts` — deletePublishTarget coverage
- [ ] `packages/agent-badge/src/commands/uninstall.test.ts` — safe defaults and purge-remote behavior
- [ ] `packages/core/src/logging/log.test.ts` — schema strictness, append, and rotation coverage
- [ ] `packages/agent-badge/src/commands/publish.test.ts` — repeated publish idempotency and privacy assertions

---

## Manual-Only Verifications

No manual-only checks are required if the full command-level and publish coverage passes end-to-end with fixtures.

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for phase-level verification runs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
