---
phase: 16
slug: migration-diagnostics-and-team-operator-ux
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run packages/core/src/publish/*.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~30-60 seconds, plus `npm run docs:check` for documentation-only changes |

---

## Sampling Rate

- **After migration or shared-health core changes:** Run `npm test -- --run packages/core/src/publish/*.test.ts packages/core/src/diagnostics/doctor.test.ts`
- **After command wiring or output changes:** Run `npm test -- --run packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts`
- **After docs changes:** Run `npm run docs:check`
- **After every plan wave:** Run `npm test -- --run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | MIGR-01 | core publish + migration integration | `npm test -- --run packages/core/src/publish/*.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts` | ✅ | ✅ green |
| 16-01-02 | 01 | 1 | MIGR-02 | diagnostics + command integration | `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` | ✅ | ✅ green |
| 16-02-01 | 02 | 2 | MIGR-03 | docs + operator wording verification | `npm run docs:check && npm test -- --run packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Add shared-health fixtures for legacy-only, healthy shared, stale shared, conflicting shared, and orphaned local publisher states
- [x] Extend `packages/core/src/publish/publish-service.test.ts` for first-shared-publish migration on an existing gist id
- [x] Extend `packages/agent-badge/src/commands/init.test.ts`, `publish.test.ts`, and `refresh.test.ts` for migration-state persistence and shared-mode continuity
- [x] Extend `packages/core/src/diagnostics/doctor.test.ts`, `packages/agent-badge/src/commands/status.test.ts`, and `doctor.test.ts` for shared health classification and remediation guidance
- [x] Extend `scripts/verify-docs.sh` so shared observation terminology and migration guidance are enforced in docs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Recovery guidance reads clearly to a real operator | MIGR-03 | Tone and sequencing are easier to evaluate by reading the rendered docs/CLI output once the automated wording checks pass | Read `README.md`, `docs/HOW-IT-WORKS.md`, and `docs/TROUBLESHOOTING.md`, then run `agent-badge status` and `agent-badge doctor` in a shared-mode fixture and confirm the recommended actions are understandable without code context |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** passed on 2026-04-02 after targeted phase checks, `npm run docs:check`, the full `npm test -- --run` sweep, and the final human-needed UAT approval.
