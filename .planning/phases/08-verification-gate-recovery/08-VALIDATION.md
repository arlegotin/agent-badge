---
phase: 8
slug: verification-gate-recovery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + TypeScript project builds |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run build && npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/core/src/providers/claude/claude-adapter.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` for build-bound work or the exact targeted `npm test -- --run ...` command for the touched failing test file.
- **After every plan wave:** Run `npm test -- --run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | REL-04 | build | `npm run build` | ✅ | ⬜ pending |
| 08-02-01 | 02 | 1 | REL-05 | targeted test | `npm test -- --run packages/core/src/diagnostics/doctor.test.ts` | ✅ | ⬜ pending |
| 08-02-02 | 02 | 1 | REL-05 | targeted test | `npm test -- --run packages/core/src/providers/claude/claude-adapter.test.ts` | ✅ | ⬜ pending |
| 08-03-01 | 03 | 2 | REL-06 | integration | `npm test -- --run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clean checkout matches current release-critical expectations | REL-06 | Needs a fresh tree/environment check beyond targeted fixture tests | Start from a clean checkout, run `npm ci`, `npm run build`, and `npm test -- --run`, then confirm no verification step depends on stale `dist/` output or outdated `.agent-badge` schema assumptions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
