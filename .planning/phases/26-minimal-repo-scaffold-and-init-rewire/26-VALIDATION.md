---
phase: 26
slug: minimal-repo-scaffold-and-init-rewire
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-04-08
updated: 2026-04-09
---

# Phase 26 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` temp-repo integration tests plus `tsc -b` typecheck |
| **Config file** | repo script entrypoints plus `packages/create-agent-badge/src/index.test.ts`, `packages/core/src/init/runtime-wiring.test.ts`, `packages/agent-badge/src/commands/init.test.ts`, `packages/agent-badge/src/commands/config.test.ts`, `packages/agent-badge/src/commands/uninstall.test.ts`, and `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` |
| **Quick run command** | `npm test -- --run packages/create-agent-badge/src/index.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts` |
| **Full suite command** | `npm run typecheck && npm test -- --run packages/create-agent-badge/src/index.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts && bash -n scripts/smoke/verify-registry-install.sh` |
| **Estimated runtime** | ~30-90 seconds for repo-owned checks |

---

## Sampling Rate

- **After initializer entrypoint changes:** Run the quick test command and re-read the repo-artifact expectations in `packages/create-agent-badge/src/index.test.ts` and `packages/agent-badge/src/commands/init.test.ts`.
- **After core scaffold reconciliation changes:** Re-run `packages/core/src/init/runtime-wiring.test.ts` before touching broader command tests.
- **After legacy-cleanup or refresh-policy changes:** Re-run the quick test command plus `packages/agent-badge/src/commands/uninstall.test.ts` to ensure init/config cleanup does not break explicit uninstall behavior.
- **After proof-surface updates:** Re-run the full suite command so stale repo-local artifact assumptions do not survive in release-readiness coverage.
- **Before `/gsd-verify-work`:** Full suite must be green and at least one legacy-rerun fixture must prove managed package.json cleanup without deleting unrelated repo content.
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | DIST-01, DIST-02 | T-26-01-01 | Initializer stops installing repo-local runtime packages and does not require package.json to exist after init | integration | `npm test -- --run packages/create-agent-badge/src/index.test.ts packages/agent-badge/src/commands/init.test.ts` | ✅ | ✅ green |
| 26-01-02 | 01 | 1 | ART-01 | T-26-01-02 | Core scaffold reconciliation manages only repo-owned artifacts and never creates managed runtime dependency/script entries by default | integration | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts` | ✅ | ✅ green |
| 26-02-01 | 02 | 2 | ART-02 | T-26-02-02 | Init/config reruns prune only managed legacy package.json keys while preserving user-owned content and keeping one hook/gitignore block | integration + regression | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/uninstall.test.ts` | ✅ | ❌ red |
| 26-02-02 | 02 | 2 | DIST-01, DIST-02, ART-01, ART-02 | T-26-02-03 | Proof surfaces stop asserting repo-local runtime ownership, and release-readiness checks reflect the minimal-artifact contract without reintroducing stale assumptions | regression | `npm run typecheck && npm test -- --run packages/create-agent-badge/src/index.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts && bash -n scripts/smoke/verify-registry-install.sh` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing temp-repo Vitest coverage already exercises initializer, init, config, hook, and uninstall seams.
- [x] Existing TypeScript project references already catch cross-package contract drift via `npm run typecheck`.
- [x] Existing smoke/readiness scripts are sufficient as syntax and expectation guardrails for this phase; no new framework is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirm a clean temporary repo initialized through the real package-manager entrypoint does not end up with repo-local `@legotin/agent-badge` ownership or agent-badge-created `node_modules` by default | DIST-02 | The published or packed initializer path depends on actual package-manager behavior outside the mocked temp-repo tests | In a temp repo, run the closest available packaged initializer flow after implementation, inspect `package.json`, lockfiles, `.gitignore`, `.git/hooks/pre-push`, and `.agent-badge/`, and confirm only repo-owned artifacts remain. If full registry proof is deferred, record the spot-check result and leave comprehensive release smoke to Phase 27. |
| Preserve a genuinely user-owned `@legotin/agent-badge` dependency during legacy cleanup when no managed legacy scripts are present | ART-02 | Escalated. The targeted automated regression currently fails because `applyMinimalRepoScaffold()` prunes the dependency based on version-shape heuristics rather than proven ownership, so validation cannot be made green without an implementation fix. | After narrowing the cleanup gate in `packages/core/src/init/runtime-wiring.ts`, add a regression in `packages/core/src/init/runtime-wiring.test.ts` (and extend `packages/agent-badge/src/commands/init.test.ts` if needed), then run `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts`. |

---

## Validation Audit 2026-04-09

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 0 |
| Escalated | 1 |

### Audit Notes

- `npm run typecheck` passed.
- `npm test -- --run packages/create-agent-badge/src/index.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts` passed with `66/66` tests green.
- `bash -n scripts/smoke/verify-registry-install.sh` passed.
- A targeted ART-02 regression was attempted and then removed after failing: current implementation still removes a user-owned `@legotin/agent-badge` dependency when no companion managed legacy script markers exist. See [26-SECURITY.md](/Volumes/git/legotin/agent-badge/.planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-SECURITY.md) and [26-REVIEW.md](/Volumes/git/legotin/agent-badge/.planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-REVIEW.md) for the underlying risk and evidence.

---

## Validation Sign-Off

- [x] All planned tasks have `<automated>` verify or explicit manual-only coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all required verification infrastructure
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending implementation fix for ART-02 preservation gap
