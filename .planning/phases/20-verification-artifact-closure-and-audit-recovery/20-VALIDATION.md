---
phase: 20
slug: verification-artifact-closure-and-audit-recovery
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-05
updated: 2026-04-05
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` + repo-owned shell artifact checks |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run packages/core/src/publish/shared-model.test.ts packages/core/src/publish/shared-merge.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/shared-badge-aggregation.test.ts packages/core/src/scan/refresh-cache.test.ts packages/core/src/scan/incremental-refresh.test.ts packages/core/src/publish/publish-trust.test.ts packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~60-120 seconds depending on the focused suites and any live recovery rerun |

---

## Sampling Rate

- **After verification-report drafting work:** Run the relevant artifact grep checks for the report being closed.
- **After Phase 19 recovery-proof refresh work:** Run `bash scripts/smoke/verify-recovery-flow.sh --phase-dir .planning/phases/19-recovery-paths-and-production-reliability-verification` and re-check the updated artifacts.
- **After validation reconciliation work:** Run the focused Phase 15 or Phase 17 validation suites before closing the corresponding `*-VALIDATION.md`.
- **After every plan wave:** Run the phase-specific artifact checks plus any focused suite tied to the files just closed.
- **Before `$gsd-verify-work`:** All artifact checks must pass, the refreshed milestone audit must report `status: passed`, and no orphaned Phase 19 requirements may remain.
- **Max feedback latency:** 120 seconds for focused suites and artifact checks; live recovery proof is the explicit longer-running gate.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | CTRL-02, CTRL-03 | artifact audit | `test -f .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VERIFICATION.md && rg -n 'Status: passed|Requirements Coverage|CONS-01|CONS-02|CONS-03|15-UAT.md|15-VALIDATION.md' .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VERIFICATION.md` | ✅ | ✅ green |
| 20-01-02 | 01 | 1 | CTRL-02 | live proof + artifact audit | `bash scripts/smoke/verify-recovery-flow.sh --phase-dir .planning/phases/19-recovery-paths-and-production-reliability-verification && rg -n 'status: passed|Shared mode: shared \\| health=healthy' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-HUMAN-UAT.md && node -e "const fs=require('fs');const text=fs.readFileSync('.planning/phases/19-recovery-paths-and-production-reliability-verification/19-HUMAN-UAT.md','utf8');const status=text.split('## Post-recovery status')[1]?.split('## Post-recovery doctor')[0]||'';const doctor=text.split('## Post-recovery doctor')[1]||'';if(/Live badge trust: unknown|publish-trust: warn|Overall: warn/.test(status+'\\n'+doctor)){process.exit(1);}" && node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('.planning/phases/19-recovery-paths-and-production-reliability-verification/19-RECOVERY-EVIDENCE.json','utf8'));const post=(data.postRecovery?.status||'')+'\\n'+(data.postRecovery?.doctor||'');if(/Live badge trust: unknown|publish-trust: warn|Overall: warn/.test(post)){process.exit(1);}"` | ✅ | ✅ green |
| 20-01-03 | 01 | 1 | CTRL-02, CTRL-03 | artifact audit | `test -f .planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md && rg -n 'Status: passed|Requirements Coverage|CTRL-02|CTRL-03|19-HUMAN-UAT.md|19-RECOVERY-EVIDENCE.json|19-VALIDATION.md' .planning/phases/19-recovery-paths-and-production-reliability-verification/19-VERIFICATION.md` | ✅ | ✅ green |
| 20-02-01 | 02 | 2 | CTRL-02, CTRL-03 | focused validation rerun + artifact audit | `npm test -- --run packages/core/src/publish/shared-model.test.ts packages/core/src/publish/shared-merge.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/shared-badge-aggregation.test.ts packages/core/src/scan/refresh-cache.test.ts packages/core/src/scan/incremental-refresh.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/init.test.ts && rg -n 'status: complete|wave_0_complete: true|\\*\\*Approval:\\*\\* complete' .planning/phases/15-cross-publisher-deduplication-and-publish-semantics/15-VALIDATION.md` | ✅ | ✅ green |
| 20-02-02 | 02 | 2 | CTRL-02, CTRL-03 | focused validation rerun + artifact audit | `npm test -- --run packages/core/src/state/state-schema.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/publish/publish-trust.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts && rg -n 'status: complete|wave_0_complete: true|\\*\\*Approval:\\*\\* complete' .planning/phases/17-publish-failure-visibility-and-state-trust/17-VALIDATION.md` | ✅ | ✅ green |
| 20-02-03 | 02 | 2 | CTRL-02, CTRL-03 | milestone audit | `test -f .planning/v1.4-MILESTONE-AUDIT.md && rg -n 'status: passed' .planning/v1.4-MILESTONE-AUDIT.md && ! rg -n 'no 15-VERIFICATION.md|no 19-VERIFICATION.md|verification_status: \"orphaned\"|15-VALIDATION.md remains in draft state with wave_0_complete: false.|17-VALIDATION.md remains in draft state with wave_0_complete: false.' .planning/v1.4-MILESTONE-AUDIT.md` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fresh authenticated rerun of the existing Phase 19 recovery harness if the prior proof remains contradictory | CTRL-02 | Requires real GitHub auth and the live repo/gist environment used by the recovery harness | Ensure valid GitHub auth is available, run `bash scripts/smoke/verify-recovery-flow.sh --phase-dir .planning/phases/19-recovery-paths-and-production-reliability-verification`, then confirm the updated HUMAN-UAT and JSON artifacts show healthy post-recovery publish state without `Live badge trust: unknown` or `publish-trust: warn` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s for focused suites and artifact checks
- [x] `nyquist_compliant: true` set in frontmatter after the plan/task map is finalized

**Approval:** complete
