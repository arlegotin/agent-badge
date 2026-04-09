---
phase: 13
slug: post-publish-registry-verification-and-final-operations
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-01
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — existing workspace vitest usage |
| **Quick run command** | `npm test -- --run packages/create-agent-badge/src/index.test.ts` |
| **Full suite command** | `npm run docs:check && npm test -- --run packages/create-agent-badge/src/index.test.ts` |
| **Estimated runtime** | ~20-30 seconds for inner-loop checks; live registry smoke reserved for wave/phase gates |

---

## Sampling Rate

- **After Task 13-01-01:** Run `bash -n scripts/smoke/verify-registry-install.sh` as the fast syntax gate; reserve live registry smoke for the wave gate.
- **After Task 13-01-02:** Run `npm test -- --run packages/create-agent-badge/src/index.test.ts`.
- **After Task 13-02-01:** Run the fast pre-smoke publish-evidence version assertion before the slow registry smoke gate.
- **After Task 13-02-02:** Run the final-state smoke/evidence assertion from the task verify.
- **After Task 13-02-03:** Run `npm run docs:check`.
- **After Wave 1 and before `$gsd-verify-work`:** Run `bash scripts/smoke/verify-registry-install.sh --version 1.1.1 --check-initializer --write-evidence --phase-dir .planning/phases/13-post-publish-registry-verification-and-final-operations`; if that run reports `"status": "blocked"`, execute the repair-release branch and then rerun the same smoke against `1.1.2`.
- **Max feedback latency:** 45 seconds for inner-loop checks; live registry smoke is an explicit wave/phase gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | REL-09 | shell-syntax | `bash -n scripts/smoke/verify-registry-install.sh` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | REL-09 | unit | `npm test -- --run packages/create-agent-badge/src/index.test.ts` | ❌ W0 | ⬜ pending |
| 13-02-01a | 02 | 2 | REL-09 | fast pre-smoke assertion | `node --input-type=module -e "import fs from 'node:fs'; const evidence=JSON.parse(fs.readFileSync('.planning/phases/12-production-publish-execution/12-PUBLISH-EVIDENCE.json','utf8')); const versions=[...new Set(evidence.packages.map((pkg)=>pkg.version))]; if(versions.length!==1) throw new Error('publish evidence versions diverge'); if(versions[0]!=='1.1.1') throw new Error('expected initial published version 1.1.1');"` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 2 | REL-09 | wave-gate smoke | `bash scripts/smoke/verify-registry-install.sh --version 1.1.1 --check-initializer --write-evidence --phase-dir .planning/phases/13-post-publish-registry-verification-and-final-operations` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | REL-09 | final-state assertion | `node --input-type=module -e "import fs from 'node:fs'; const report=JSON.parse(fs.readFileSync('.planning/phases/13-post-publish-registry-verification-and-final-operations/13-REGISTRY-SMOKE.json','utf8')); if(report.status!=='passed') throw new Error('final smoke must be passed'); if(!['1.1.1','1.1.2'].includes(report.version)) throw new Error('unexpected final version');"` | ✅ | ⬜ pending |
| 13-02-03 | 02 | 2 | OPER-07 | docs/assertion | `npm run docs:check` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/smoke/verify-registry-install.sh` — exact-version registry smoke for runtime, core, and initializer behavior
- [ ] `packages/create-agent-badge/src/index.test.ts` — direct-execution coverage for the initializer bin path
- [ ] `scripts/verify-docs.sh` updates — enforce Phase 13 runbook strings and evidence artifact references
- [ ] `.planning/phases/13-post-publish-registry-verification-and-final-operations/13-REGISTRY-SMOKE.json` generation path
- [ ] `.planning/phases/13-post-publish-registry-verification-and-final-operations/13-REGISTRY-SMOKE.md` generation path

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub Actions workflow confirmation is documented correctly for maintainers without `gh` | OPER-07 | The local environment cannot programmatically validate the GitHub web UI flow or repository-side workflow access | Open the Actions web UI, confirm the runbook points maintainers to `workflow_dispatch`, and verify the checklist language matches the real browser-only confirmation path. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s for inner-loop checks
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
