---
phase: 03
slug: historical-backfill-and-attribution-review
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 03 - Validation Strategy

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
| 3-03-01 | 01 | 1 | ATTR-02 | integration | `npm test -- --run packages/core/src/scan/full-backfill.test.ts` | No - Wave 0 | Pending |
| 3-03-02 | 02 | 2 | ATTR-03, ATTR-04, ATTR-05 | unit | `npm test -- --run packages/core/src/attribution/attribution-engine.test.ts` | No - Wave 0 | Pending |
| 3-03-03 | 03 | 3 | ATTR-02, ATTR-05, SCAN-05 | integration | `npm test -- --run packages/core/src/scan/scan-report.test.ts packages/agent-badge/src/commands/scan.test.ts` | No - Wave 0 | Pending |

*Status: pending -> green -> red -> flaky*

---

## Wave 0 Requirements

- [ ] `packages/core/src/scan/full-backfill.test.ts` - first-run backfill orchestration coverage
- [ ] `packages/core/src/attribution/attribution-engine.test.ts` - evidence ordering, ambiguity exclusion, and override reuse coverage
- [ ] `packages/core/src/scan/scan-report.test.ts` - report formatting and redaction coverage
- [ ] `packages/agent-badge/src/commands/scan.test.ts` - CLI scan integration and state-update coverage

---

## Manual-Only Verifications

All planned Phase 3 behaviors should be automatable with fixtures and captured CLI output. No manual-only checks are required if the report redaction, override reuse, and failed-scan state protections are covered by tests.

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
