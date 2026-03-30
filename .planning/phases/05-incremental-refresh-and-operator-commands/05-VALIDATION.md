---
phase: 05
slug: incremental-refresh-and-operator-commands
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 05 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-05-01 | 01 | 1 | SCAN-04, PUBL-05 | unit + integration | `npm test -- --run packages/core/src/scan packages/core/src/publish` | Partial - extend existing suites | Pending |
| 5-05-02 | 02 | 2 | OPER-02, OPER-03, OPER-04 | command + integration | `npm test -- --run packages/agent-badge/src/commands` | Partial - extend existing suites | Pending |
| 5-05-03 | 03 | 3 | OPER-01 | integration | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands` | Partial - hook/runtime suites exist | Pending |

*Status: pending -> green -> red -> flaky*

---

## Wave 0 Requirements

- [ ] `packages/core/src/scan/incremental-refresh.test.ts` - incremental checkpoint advancement, partial failure, and no-full-rescan coverage
- [ ] `packages/core/src/publish/publish-service.test.ts` - hash-based skip-on-no-change coverage
- [ ] `packages/agent-badge/src/commands/refresh.test.ts` - end-to-end refresh state recovery and hook-mode coverage
- [ ] `packages/agent-badge/src/commands/status.test.ts` - totals/provider/publish/checkpoint output coverage
- [ ] `packages/agent-badge/src/commands/config.test.ts` - supported mutation and unsafe privacy rejection coverage

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Managed `pre-push` refresh feels fast and failure-soft in a real repository | OPER-01, OPER-02 | The final UX depends on real git hook invocation, local provider data size, and operator-facing output quality. | In a temp git repo initialized with `agent-badge`, run a normal `git push`-equivalent hook invocation and confirm refresh exits without blocking on common degraded cases. Then run `git push --no-verify` or the equivalent bypass path and confirm Git bypasses the hook entirely. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
