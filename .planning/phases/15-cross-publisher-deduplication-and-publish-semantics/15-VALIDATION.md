---
phase: 15
slug: cross-publisher-deduplication-and-publish-semantics
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
updated: 2026-04-05
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run packages/core/src/publish/*.test.ts packages/core/src/scan/refresh-cache.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~30-60 seconds depending on publish/cache test breadth |

---

## Sampling Rate

- **After shared-model or reducer work:** Run `npm test -- --run packages/core/src/publish/*.test.ts`
- **After refresh-cache or incremental-refresh work:** Run `npm test -- --run packages/core/src/scan/refresh-cache.test.ts packages/core/src/scan/incremental-refresh.test.ts`
- **After publish/refresh command wiring changes:** Run `npm test -- --run packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts`
- **After every plan wave:** Run `npm test -- --run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | CONS-01 | schema + reducer unit | `npm test -- --run packages/core/src/publish/shared-model.test.ts packages/core/src/publish/shared-merge.test.ts` | ✅ | ✅ green |
| 15-01-02 | 01 | 1 | CONS-01, CONS-03 | cache + command integration | `npm test -- --run packages/core/src/scan/refresh-cache.test.ts packages/core/src/scan/incremental-refresh.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts` | ✅ | ✅ green |
| 15-02-01 | 02 | 2 | CONS-02, CONS-03 | publish convergence integration | `npm test -- --run packages/core/src/publish/publish-service.test.ts packages/core/src/publish/shared-badge-aggregation.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Extend `packages/core/src/publish/shared-model.test.ts` for schema-version `2`, observation maps, and privacy rejection of raw session keys
- [x] Extend `packages/core/src/publish/shared-merge.test.ts` for session grouping, duplicate watermark selection, and order-independent override conflict resolution
- [x] Extend `packages/core/src/publish/publish-service.test.ts` for repeated publish order convergence, mixed-publisher duplicate sessions, and schema-v1 isolation
- [x] Extend `packages/core/src/publish/shared-badge-aggregation.test.ts` so badge payloads are derived from canonical session observations rather than contributor totals
- [x] Extend `packages/core/src/scan/refresh-cache.test.ts` and `packages/core/src/scan/incremental-refresh.test.ts` so ambiguous candidate usage survives into publishable cache state
- [x] Extend `packages/agent-badge/src/commands/publish.test.ts` and `packages/agent-badge/src/commands/refresh.test.ts` so both command paths feed the new publish-service contract

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

**Approval:** complete

Closure evidence refreshed on 2026-04-05:

- Focused rerun passed: `npm test -- --run packages/core/src/publish/shared-model.test.ts packages/core/src/publish/shared-merge.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/shared-badge-aggregation.test.ts packages/core/src/scan/refresh-cache.test.ts packages/core/src/scan/incremental-refresh.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/init.test.ts`
- Verification remains passed in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VERIFICATION.md`
- Supporting execution evidence remains in `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-UAT.md`, `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-01-SUMMARY.md`, and `.planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-02-SUMMARY.md`
