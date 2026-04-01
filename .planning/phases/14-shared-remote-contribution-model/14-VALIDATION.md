---
phase: 14
slug: shared-remote-contribution-model
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — existing workspace vitest usage |
| **Quick run command** | `npm test -- --run packages/core/src/publish` |
| **Full suite command** | `npm test -- --run packages/core/src/publish packages/agent-badge/src/commands/publish.test.ts packages/core/src/state packages/core/src/init && npm run docs:check` |
| **Estimated runtime** | ~30-60 seconds depending on publish/init test breadth |

---

## Sampling Rate

- **After shared-state schema/helper work:** Run `npm test -- --run packages/core/src/publish`
- **After publish command wiring changes:** Run `npm test -- --run packages/core/src/publish packages/agent-badge/src/commands/publish.test.ts`
- **After state/init identity changes:** Run `npm test -- --run packages/core/src/state packages/core/src/init`
- **After docs/privacy updates:** Run `npm run docs:check`
- **After every plan wave:** Run the full suite command above
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | TEAM-01, TEAM-02 | schema/merge unit | `npm test -- --run packages/core/src/publish/shared-model.test.ts packages/core/src/publish/shared-merge.test.ts` | ✅ | ✅ green |
| 14-02-01 | 02 | 2 | TEAM-01, TEAM-02 | publish integration | `npm test -- --run packages/core/src/publish/github-gist-client.test.ts packages/core/src/publish/publish-service.test.ts packages/agent-badge/src/commands/publish.test.ts` | ✅ | ✅ green |
| 14-02-02 | 02 | 2 | TEAM-01 | state/init regression | `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/publish/publish-state.test.ts` | ✅ | ✅ green |
| 14-03-01 | 03 | 3 | TEAM-03 | privacy/schema assertions | `npm test -- --run packages/core/src/publish/shared-badge-aggregation.test.ts packages/core/src/publish/publish-service.test.ts packages/agent-badge/src/commands/publish.test.ts && npm run docs:check` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/core/src/publish/shared-model.ts` defines the shared-state boundary
- [x] `packages/core/src/publish/shared-badge-aggregation.test.ts` provides direct shared aggregation coverage
- [x] publish-service tests cover fetch-merge-write behavior
- [x] state/init tests cover stable publisher identity persistence across reruns
- [x] privacy assertions cover the shared-state serializer and docs wording

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Shared-mode wording remains understandable in public docs | TEAM-03 | Automated checks can enforce strings, not clarity | Read `docs/HOW-IT-WORKS.md` and `docs/PRIVACY.md` after updates and confirm they still describe the public gist contents without implying raw transcripts or local paths are published. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** passed on 2026-04-02 after the full Phase 14 test suite and docs gate succeeded, plus a manual read of `docs/HOW-IT-WORKS.md` and `docs/PRIVACY.md` confirmed the wording stayed aggregate-only.
