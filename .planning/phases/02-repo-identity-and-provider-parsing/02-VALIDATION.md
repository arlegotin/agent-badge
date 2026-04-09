---
phase: 02
slug: repo-identity-and-provider-parsing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 02 - Validation Strategy

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
| 2-02-01 | 01 | 1 | ATTR-01 | unit | `npm test -- --run packages/core/src/repo/repo-fingerprint.test.ts` | No - Wave 0 | Pending |
| 2-02-02 | 02 | 2 | SCAN-02 | integration | `npm test -- --run packages/core/src/providers/codex/codex-adapter.test.ts` | No - Wave 0 | Pending |
| 2-02-03 | 03 | 3 | SCAN-01, SCAN-03 | unit/integration | `npm test -- --run packages/core/src/init/default-config.test.ts packages/core/src/init/preflight.test.ts packages/core/src/providers/claude/claude-adapter.test.ts` | No / Yes / No | Pending |

*Status: pending -> green -> red -> flaky*

---

## Wave 0 Requirements

- [ ] `packages/core/src/repo/repo-fingerprint.test.ts` - canonical repo fingerprint coverage
- [ ] `packages/core/src/init/default-config.test.ts` - provider-default enablement coverage
- [ ] `packages/core/src/providers/codex/codex-adapter.test.ts` - Codex SQLite parsing and lineage coverage
- [ ] `packages/core/src/providers/claude/claude-adapter.test.ts` - Claude JSONL parsing and message-id dedupe coverage
- [ ] `packages/testkit/src/codex-fixtures.ts` - sanitized SQLite fixture helpers
- [ ] `packages/testkit/src/claude-fixtures.ts` - sanitized Claude JSONL fixture helpers

---

## Manual-Only Verifications

All planned Phase 2 behaviors should be automatable with fixtures and unit/integration tests. No manual-only checks are required if fixture coverage lands with the adapters.

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
