---
phase: 22
slug: trusted-publish-execution-and-evidence-capture
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-05
---

# Phase 22 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | repo-owned shell verification plus focused `vitest` coverage for release helper scripts |
| **Config file** | `vitest.config.ts` plus phase-owned workflow/evidence artifacts |
| **Quick run command** | `npm --silent run release:preflight -- --json > .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-preflight.json || true` |
| **Full suite command** | `npm test -- --run scripts/release/capture-publish-evidence.test.ts && npm run docs:check` plus phase-owned artifact grep checks |
| **Estimated runtime** | ~10-30 seconds for repo-owned checks, excluding live workflow execution time |

---

## Sampling Rate

- **After any repo-side release-script/doc change:** Re-run the affected focused command (`release:preflight`, docs checks, or evidence artifact greps).
- **After workflow execution facts are captured:** Verify workflow metadata and published version are recorded in phase-owned artifacts immediately.
- **After release-evidence tool changes:** Re-run the focused `scripts/release/capture-publish-evidence.test.ts` suite before generating final artifacts.
- **After evidence capture work:** Re-run the full phase-owned artifact grep checks.
- **Before `$gsd-verify-work`:** Phase 22 evidence artifacts must exist and agree on workflow run, publish path, commit SHA, and published version.
- **Max feedback latency:** 30 seconds for local repo-owned checks; workflow completion is the explicit longer-running external gate.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | PUB-01 | workflow preflight gate | `npm --silent run release:preflight -- --json > .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-preflight.json || true` | ✅ | ⬜ pending |
| 22-01-02 | 01 | 1 | PUB-01, PUB-02 | workflow reconciliation record | `test -f .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md && rg -n 'Workflow run URL|Published version|Published commit|github-actions' .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-WORKFLOW-RUN.md` | ✅ | ⬜ pending |
| 22-02-01 | 02 | 2 | PUB-02 | release-evidence tool repair | `npm test -- --run scripts/release/capture-publish-evidence.test.ts && rg -n 'artifact-prefix|published-git-sha' scripts/release/capture-publish-evidence.ts scripts/release/capture-publish-evidence.test.ts docs/RELEASE.md` | ✅ | ⬜ pending |
| 22-02-02 | 02 | 2 | PUB-01, PUB-02 | phase-owned evidence generation and alignment | `test -f .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json && test -f .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.md && rg -n 'github-actions|workflowRunUrl|workflowRunId|workflowRunConclusion|publishedAt|gitSha|packages|registryResults' .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json && rg -n 'Publish path: github-actions|Published commit:|Workflow run:|Published at:|Registry results:' .planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing repo-owned release scripts already cover preflight, versioning, publish-impact, and most evidence capture behavior.
- [x] No new test framework is required for Phase 22.
- [x] Phase-owned workflow and publish evidence artifacts can be verified with shell checks and focused release-script tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirming which GitHub Actions run is canonical for the already-visible `1.1.3` release | PUB-01, PUB-02 | The exact run URL/ID/conclusion are external facts and were not captured in-repo at publish time | Open the exact workflow run, confirm success, and record run URL, run ID, commit SHA, published version, and conclusion in `22-WORKFLOW-RUN.md` before final evidence capture. |
| Confirming the published version is visible in npm for all three packages | PUB-01, PUB-02 | npm visibility is a live external fact and depends on the real publish event | Run `npm view` checks for all three packages after the workflow completes and record the exact version alignment in the Phase 22 evidence artifacts. |

---

## Validation Sign-Off

- [x] All planned Phase 22 tasks have `<automated>` verify or explicit manual-only gates
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all needed local verification infrastructure
- [x] No watch-mode flags
- [x] Local feedback latency stays under 30 seconds for repo-owned checks
- [x] `nyquist_compliant: true` set in frontmatter for planning

**Approval:** pending
