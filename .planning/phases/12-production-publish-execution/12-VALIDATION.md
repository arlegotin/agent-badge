---
phase: 12
slug: production-publish-execution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + repo-owned release scripts + manual npm/GitHub verification |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run scripts/release/preflight.test.ts scripts/release/capture-publish-evidence.test.ts` |
| **Full suite command** | `npm run docs:check && npm run typecheck && npm test -- --run && npm run verify:clean-checkout` |
| **Estimated runtime** | ~90 seconds plus manual publish time |

---

## Sampling Rate

- **After every task commit:** Run the targeted release-script test file(s) or exact `rg`/docs assertion tied to the changed files.
- **After every plan wave:** Run `npm run docs:check && npm run typecheck && npm test -- --run`.
- **Before `$gsd-verify-work`:** Full suite must be green, then run the real preflight and production publish steps manually from a credentialed maintainer environment.
- **Max feedback latency:** 60 seconds for repo-only changes; live publish verification remains manual.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | REL-08 | unit | `npm test -- --run scripts/release/capture-publish-evidence.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | REL-08 | docs/script assertion | `npm run docs:check && rg -n 'release:preflight -- --json|workflow_dispatch|NPM_TOKEN|12-PUBLISH-EVIDENCE' docs/RELEASE.md scripts/verify-docs.sh package.json` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | REL-08 | manual gate capture | `npm run release:preflight -- --json` | ✅ | ⬜ pending |
| 12-02-02 | 02 | 2 | REL-08 | manual post-publish registry check + registry-to-manifest consistency check | `npm view agent-badge version dist-tags.latest --json && npm view create-agent-badge version dist-tags.latest --json && npm view @agent-badge/core version dist-tags.latest --json && node --input-type=module -e \"import fs from 'node:fs'; const preflight=JSON.parse(fs.readFileSync('.planning/phases/12-production-publish-execution/12-preflight.json','utf8')); const evidence=JSON.parse(fs.readFileSync('.planning/phases/12-production-publish-execution/12-PUBLISH-EVIDENCE.json','utf8')); const expected=new Map(preflight.packages.map((p)=>[p.packageName,p.intendedVersion])); let ok=true; for (const r of evidence.registryResults){const expectedVersion=expected.get(r.package); if (!expectedVersion || r.version!==expectedVersion){ok=false; break;}} if(!ok){process.exit(1);} ` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/release/capture-publish-evidence.ts` — repo-owned evidence helper for structured release records
- [ ] `scripts/release/capture-publish-evidence.test.ts` — deterministic coverage for evidence serialization and required fields

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Final preflight output reflects live registry and auth state immediately before publish | REL-08 | Requires current external registry/auth state | Run `npm run release:preflight -- --json` from the maintainer environment and save the output under the Phase 12 directory before triggering publish |
| The intended production publish path actually succeeds for current source | REL-08 | Requires real npm/GitHub credentials and an irreversible publish action | Trigger the chosen production publish path from `docs/RELEASE.md`, capture the workflow run URL/ID or explicit local fallback metadata, and confirm the run completed successfully |
| Registry-visible results match the expected package inventory and versions | REL-08 | Requires the live npm registry after publish | Run `npm view agent-badge version dist-tags.latest --json`, `npm view create-agent-badge version dist-tags.latest --json`, and `npm view @agent-badge/core version dist-tags.latest --json`, then record the observed results in the Phase 12 evidence artifact |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for repo-only checks
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
