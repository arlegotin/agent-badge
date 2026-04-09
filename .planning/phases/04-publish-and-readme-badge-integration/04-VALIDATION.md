---
phase: 04
slug: publish-and-readme-badge-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 04 - Validation Strategy

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
| 4-04-01 | 01 | 1 | PUBL-01, PUBL-02 | integration | `npm test -- --run packages/core/src/publish/github-gist-client.test.ts packages/core/src/publish/publish-state.test.ts` | No - Wave 0 | Pending |
| 4-04-02 | 02 | 2 | PUBL-03 | unit + command | `npm test -- --run packages/core/src/publish/badge-payload.test.ts packages/agent-badge/src/commands/publish.test.ts` | No - Wave 0 | Pending |
| 4-04-03 | 03 | 3 | BOOT-05, PUBL-04 | integration | `npm test -- --run packages/core/src/publish/readme-badge.test.ts packages/agent-badge/src/commands/init.test.ts` | Partial - init test exists | Pending |

*Status: pending -> green -> red -> flaky*

---

## Wave 0 Requirements

- [ ] `packages/core/src/publish/github-gist-client.test.ts` - stubbed public-gist create/connect/update coverage
- [ ] `packages/core/src/publish/publish-state.test.ts` - config/state reconciliation and deferred-mode coverage
- [ ] `packages/core/src/publish/badge-payload.test.ts` - Shields endpoint payload and aggregate-only coverage
- [ ] `packages/core/src/publish/readme-badge.test.ts` - README marker insertion and no-README snippet coverage
- [ ] `packages/agent-badge/src/commands/publish.test.ts` - publish command wiring and `lastPublishedHash` coverage

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Public gist badge renders through the final Shields URL | PUBL-03, PUBL-04 | The final render path depends on live GitHub + Shields behavior and should be smoke-checked once with a real public gist after local tests pass. | Connect or create a real public gist, run Phase 4 publish/init flow, then request the stored badge URL and confirm it returns a rendered badge without changing the README URL on a second publish. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
