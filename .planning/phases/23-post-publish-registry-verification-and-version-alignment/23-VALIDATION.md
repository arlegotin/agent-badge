---
phase: 23
slug: post-publish-registry-verification-and-version-alignment
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-05
---

# Phase 23 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | repo-owned shell verification, `npm view` registry reads, and docs drift checks |
| **Config file** | `scripts/smoke/verify-registry-install.sh`, `scripts/verify-docs.sh`, and phase-owned evidence artifacts |
| **Quick run command** | `bash -n scripts/smoke/verify-registry-install.sh` |
| **Full suite command** | `npm run docs:check` plus the Phase 23 exact-version smoke and latest-alias verification commands |
| **Estimated runtime** | ~10-30 seconds for local contract/doc checks, plus live npm/network time for registry smoke |

---

## Sampling Rate

- **After smoke-script changes:** Run `bash -n scripts/smoke/verify-registry-install.sh` and grep for the new artifact-prefix contract before any live smoke.
- **After exact-version smoke capture:** Verify `23-REGISTRY-SMOKE.*` exists and still records `1.1.3` plus runtime and initializer status.
- **After latest-alias verification:** Re-read the saved latest-resolution artifact and confirm it records `npm init agent-badge@latest` plus the observed latest version.
- **After manifest/lockfile or docs alignment changes:** Run `npm run docs:check` and grep for `1.1.3`, `23-REGISTRY-SMOKE`, and `^1.1.3` across the aligned files.
- **Before `$gsd-verify-work`:** Phase 23 must have phase-owned smoke evidence, latest-alias evidence, and a final alignment verdict or explicit repair checkpoint.
- **Max feedback latency:** 30 seconds for repo-owned checks; live npm verification is the explicit longer-running gate.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | REG-01, REG-02 | smoke contract ownership | `bash -n scripts/smoke/verify-registry-install.sh && rg -n 'artifact-prefix|REGISTRY-SMOKE' scripts/smoke/verify-registry-install.sh` | ⬜ pending | ⬜ pending |
| 23-01-02 | 01 | 1 | REG-01 | live exact-version smoke plus latest alias capture | `node --input-type=module -e "import fs from 'node:fs'; const report=JSON.parse(fs.readFileSync('.planning/phases/22-trusted-publish-execution-and-evidence-capture/22-PUBLISH-EVIDENCE.json','utf8')); const versions=[...new Set(report.packages.map((pkg)=>pkg.version))]; if(versions.length!==1||versions[0]!=='1.1.3') throw new Error('expected released version 1.1.3');" && set +e; bash scripts/smoke/verify-registry-install.sh --version 1.1.3 --check-initializer --write-evidence --phase-dir .planning/phases/23-post-publish-registry-verification-and-version-alignment --artifact-prefix 23-REGISTRY-SMOKE; status=$?; set -e; test \"$status\" -eq 0 -o \"$status\" -eq 1; test -f .planning/phases/23-post-publish-registry-verification-and-version-alignment/23-REGISTRY-SMOKE.json; test -f .planning/phases/23-post-publish-registry-verification-and-version-alignment/23-REGISTRY-SMOKE.md` | ⬜ pending | ⬜ pending |
| 23-02-01 | 02 | 2 | REG-02 | local version/docs alignment | `npm run docs:check && rg -n '1.1.3|23-REGISTRY-SMOKE|\\^1.1.3' package-lock.json packages/core/package.json packages/agent-badge/package.json packages/create-agent-badge/package.json docs/RELEASE.md scripts/verify-docs.sh` | ⬜ pending | ⬜ pending |
| 23-02-02 | 02 | 2 | REG-01, REG-02 | final alignment verdict or repair checkpoint | `test -f .planning/phases/23-post-publish-registry-verification-and-version-alignment/23-VERSION-ALIGNMENT.md && rg -n '1.1.3|dist-tags.latest|npm init agent-badge@latest|Aligned with released 1.1.3|Repair release required' .planning/phases/23-post-publish-registry-verification-and-version-alignment/23-VERSION-ALIGNMENT.md` | ⬜ pending | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing repo-owned registry smoke infrastructure already exists in `scripts/smoke/verify-registry-install.sh`
- [x] No new test framework is required for Phase 23
- [x] Phase-owned registry smoke and alignment artifacts can be verified with shell checks plus `npm run docs:check`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirming that `npm init agent-badge@latest` resolves to the intended published initializer at live registry time | REG-01 | The `latest` alias is a live npm registry fact and must be observed at execution time | Record the `npm view ... version dist-tags.latest --json` outputs and the `npm init agent-badge@latest` outcome in the saved Phase 23 latest-resolution artifact. |
| Deciding whether a blocked `1.1.3` smoke requires a new repair release | REG-01, REG-02 | A fresh production publish is a release decision, not just a local verification rerun | Preserve the blocked evidence first, then create an explicit repair artifact and stop for a publish checkpoint instead of guessing. |

---

## Validation Sign-Off

- [x] All planned Phase 23 tasks have `<automated>` verify or explicit manual-only gates
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all needed local verification infrastructure
- [x] No watch-mode flags
- [x] Local feedback latency stays under 30 seconds for repo-owned checks
- [x] `nyquist_compliant: true` set in frontmatter for planning

**Approval:** pending
