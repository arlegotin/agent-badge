---
phase: 14
slug: shared-remote-contribution-model
status: draft
nyquist_compliant: true
wave_0_complete: false
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
| 14-01-01 | 01 | 1 | TEAM-01, TEAM-02 | schema/merge unit | `npm test -- --run packages/core/src/publish` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | TEAM-01, TEAM-02 | publish integration | `npm test -- --run packages/core/src/publish packages/agent-badge/src/commands/publish.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | TEAM-01 | state/init regression | `npm test -- --run packages/core/src/state packages/core/src/init` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 2 | TEAM-03 | privacy/schema assertions | `npm test -- --run packages/core/src/publish packages/core/src/state && npm run docs:check` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/core/src/publish/shared-state-schema.ts` or equivalent shared-state boundary exists
- [ ] `packages/core/src/publish/shared-state.test.ts` or equivalent direct coverage exists
- [ ] publish-service tests cover fetch-merge-write behavior
- [ ] state/init tests cover stable publisher identity persistence across reruns
- [ ] privacy assertions cover the shared-state serializer and docs wording

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Shared-mode wording remains understandable in public docs | TEAM-03 | Automated checks can enforce strings, not clarity | Read `docs/HOW-IT-WORKS.md` and `docs/PRIVACY.md` after updates and confirm they still describe the public gist contents without implying raw transcripts or local paths are published. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
