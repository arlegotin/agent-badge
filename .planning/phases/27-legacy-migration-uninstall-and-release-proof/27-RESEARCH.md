# Phase 27: Legacy Migration, Uninstall, And Release Proof - Research

**Researched:** 2026-04-09 [VERIFIED: environment context]  
**Domain:** Legacy repo-local to shared-runtime migration proof, uninstall alignment, and packaged or registry smoke verification for the global-first distribution model. [VERIFIED: .planning/ROADMAP.md][VERIFIED: .planning/REQUIREMENTS.md]  
**Confidence:** HIGH for phase scope and gap identification, MEDIUM-HIGH for the exact implementation split. [VERIFIED: roadmap/requirements/codebase inspection][ASSUMED]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| MIG-01 | Repositories previously initialized with repo-local runtime wiring can migrate to the new model without losing refresh, publish, status, doctor, or uninstall behavior. [VERIFIED: .planning/REQUIREMENTS.md] | Reuse the migration primitives already present in `runInitCommand()`, publish/refresh migration reporting, `applyMinimalRepoScaffold()`, `removeRepoLocalRuntimeWiring()`, `status`, and `doctor`, then add end-to-end legacy fixture coverage that proves those seams work together on a migrated repo. [VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts][VERIFIED: packages/agent-badge/src/commands/publish.test.ts][VERIFIED: packages/agent-badge/src/commands/refresh.test.ts][VERIFIED: packages/agent-badge/src/commands/status.ts][VERIFIED: packages/core/src/diagnostics/doctor.test.ts][VERIFIED: packages/core/src/init/runtime-wiring.ts] |
| MIG-02 | Docs, help text, uninstall flows, and clean temp verification explicitly cover the global install model and assert the absence of repo-local runtime artifacts by default. [VERIFIED: .planning/REQUIREMENTS.md] | Rewrite user docs and examples away from `npx --no-install`, repo-local runtime, and managed package-script language; update smoke scripts so initializer proof asserts minimal repo artifacts while direct-runtime proof remains a separate path. [VERIFIED: README.md][VERIFIED: docs/INSTALL.md][VERIFIED: docs/QUICKSTART.md][VERIFIED: docs/CLI.md][VERIFIED: docs/HOW-IT-WORKS.md][VERIFIED: docs/FAQ.md][VERIFIED: scripts/smoke/verify-registry-install.sh][VERIFIED: scripts/smoke/verify-packed-install.sh] |
</phase_requirements>

## Project Constraints

- Phase 25 already established the shared PATH-based runtime contract, and Phase 26 already removed repo-local runtime ownership from the default init path. Phase 27 must finish migration and proof work without redesigning those decisions. [VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-RESEARCH.md][VERIFIED: .planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-RESEARCH.md][VERIFIED: .planning/STATE.md]
- The default initialized repo artifact set remains intentionally minimal: `.agent-badge/*`, managed `.gitignore` lines, README badge markup, and optional managed hook content. Phase 27 must not reintroduce repo-local `node_modules`, managed runtime dependencies, or managed package scripts as the default story. [VERIFIED: .planning/REQUIREMENTS.md][VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/init.ts]
- Init and uninstall remain idempotent and privacy-safe. Migration proof and docs must not leak local paths, raw transcript data, or other non-aggregate local evidence. [VERIFIED: AGENTS.md][VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/agent-badge/src/commands/uninstall.ts]
- Existing shared-publish migration guidance still matters: when a repo is migrating old single-writer state, the first reconnect or publish should happen from the original publisher machine so gist-backed continuity stays trustworthy. [VERIFIED: docs/MANUAL-GIST.md][VERIFIED: docs/HOW-IT-WORKS.md][VERIFIED: docs/RECOVERY.md][VERIFIED: packages/core/src/diagnostics/doctor.test.ts]
- Use the existing TypeScript, Vitest, and shell-smoke infrastructure already present in the repo. This phase is a behavior-proof and operator-surface alignment pass, not a tooling migration. [VERIFIED: package.json]

## Summary

Phase 27 is not starting from zero. The codebase already contains several migration-safe building blocks that were deliberately left short of full public proof in Phases 25 and 26. `applyMinimalRepoScaffold()` already prunes managed legacy `package.json` entries while preserving user-owned manifest content, `runInitCommand()` already emits `- Publish mode:` and `- Migration:` lines, publish and refresh already report `Migration: legacy -> shared` on the first shared write, uninstall already removes both the new shared hook block and the legacy `npm run --silent agent-badge:refresh` hook block without deleting custom lines, and `status` plus `doctor` already understand legacy shared-mode repair signals such as `legacy-no-contributors` and "original publisher machine" guidance. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/core/src/init/runtime-wiring.test.ts][VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts][VERIFIED: packages/agent-badge/src/commands/publish.test.ts][VERIFIED: packages/agent-badge/src/commands/refresh.test.ts][VERIFIED: packages/agent-badge/src/commands/uninstall.test.ts][VERIFIED: packages/agent-badge/src/commands/status.ts][VERIFIED: packages/core/src/diagnostics/doctor.test.ts]

The main remaining gap is that the public story and external proof surfaces still lag behind the actual code. User docs and README examples still repeatedly tell npm-initialized users to run `npx --no-install agent-badge ...`, describe init as wiring a repo-local runtime, or say the initializer installs `@legotin/agent-badge` into the target repo. `docs/FAQ.md` still says `create-agent-badge` installs the runtime package. `scripts/smoke/verify-registry-install.sh` still expects a repo-local `node_modules/.bin/agent-badge` binary and `npx --no-install` to work after `npm init agent-badge@<version>`, which is directly contrary to the Phase 26 contract. `scripts/smoke/verify-packed-install.sh` still proves only direct package installation, which is valid for the runtime package but does not prove the initializer leaves minimal repo artifacts by default. [VERIFIED: README.md][VERIFIED: docs/INSTALL.md][VERIFIED: docs/QUICKSTART.md][VERIFIED: docs/CLI.md][VERIFIED: docs/HOW-IT-WORKS.md][VERIFIED: docs/TROUBLESHOOTING.md][VERIFIED: docs/CONFIGURATION.md][VERIFIED: docs/MANUAL-GIST.md][VERIFIED: docs/AUTH.md][VERIFIED: docs/FAQ.md][VERIFIED: scripts/smoke/verify-registry-install.sh][VERIFIED: scripts/smoke/verify-packed-install.sh]

That means Phase 27 should focus on proof, not another architecture pivot. The safest delivery shape is:

1. prove legacy repo migration and uninstall compatibility as an end-to-end command matrix built on the existing migration primitives,
2. rewrite docs and CLI/help examples so the operator story consistently says "shared runtime/global or user-scoped install" instead of "repo-local wrapper", and
3. update release-proof smoke flows so direct runtime installation and npm initializer behavior are tested as two separate contracts.

Inference: the code changes for Phase 27 are likely modest compared with the proof-surface and documentation changes, but the phase still needs execution because current public docs and release smoke would falsely describe or verify the old model. [VERIFIED: code and docs above][ASSUMED]

## Recommended Delivery Shape

### 27-01: Legacy migration and uninstall compatibility proof

**Goal:** Close MIG-01 by proving that a repo previously wired under the repo-local model can converge to the shared-runtime/minimal-artifact model without losing normal command behavior.

**What to build:**
- End-to-end legacy repo fixtures that start with managed repo-local dependency or script ownership and legacy hook content, then exercise `init`, `refresh`, `publish`, `status`, `doctor`, and `uninstall` in combinations that matter for real migration paths. [ASSUMED]
- Stronger proof that gist continuity and migration reporting survive legacy-to-shared transition without rotating the stable badge URL or dropping publish state. [VERIFIED: packages/agent-badge/src/commands/init.test.ts][VERIFIED: packages/agent-badge/src/commands/publish.test.ts][VERIFIED: packages/agent-badge/src/commands/refresh.test.ts]
- Explicit uninstall regression coverage for mixed legacy/shared repo states, not just isolated hook cleanup. [VERIFIED: packages/agent-badge/src/commands/uninstall.test.ts][ASSUMED]

**Best file candidates:**
- `packages/core/src/init/runtime-wiring.test.ts`
- `packages/agent-badge/src/commands/init.test.ts`
- `packages/agent-badge/src/commands/refresh.test.ts`
- `packages/agent-badge/src/commands/publish.test.ts`
- `packages/agent-badge/src/commands/status.test.ts`
- `packages/agent-badge/src/commands/doctor.test.ts`
- `packages/agent-badge/src/commands/uninstall.test.ts`

### 27-02: Global-first docs and command-help alignment

**Goal:** Close the operator-communication half of MIG-02 so every public page describes the current distribution model truthfully.

**What to build:**
- Replace repo-local wrapper instructions (`npx --no-install`, "repo-local runtime", local install as the default story) with shared-runtime or global/user-scoped install guidance. [VERIFIED: README.md][VERIFIED: docs/INSTALL.md][VERIFIED: docs/QUICKSTART.md][VERIFIED: docs/CLI.md][VERIFIED: docs/HOW-IT-WORKS.md][VERIFIED: docs/TROUBLESHOOTING.md][VERIFIED: docs/CONFIGURATION.md][VERIFIED: docs/AUTH.md]
- Update uninstall docs so reinstall guidance no longer assumes repo-local runtime ownership after default init. [VERIFIED: docs/UNINSTALL.md]
- Fix FAQ and install docs so `create-agent-badge` is described as an initializer entrypoint that delegates to `runInitCommand()`, not as a post-init local runtime installer. [VERIFIED: docs/FAQ.md][VERIFIED: packages/create-agent-badge/src/index.ts]
- Update any command summaries or example `- Setup:` lines that still imply "local runtime" readiness instead of "shared runtime" readiness. [VERIFIED: docs/CLI.md][VERIFIED: docs/INSTALL.md][VERIFIED: docs/QUICKSTART.md]

**Best file candidates:**
- `README.md`
- `docs/INSTALL.md`
- `docs/QUICKSTART.md`
- `docs/CLI.md`
- `docs/HOW-IT-WORKS.md`
- `docs/TROUBLESHOOTING.md`
- `docs/CONFIGURATION.md`
- `docs/AUTH.md`
- `docs/UNINSTALL.md`
- `docs/FAQ.md`
- `docs/MANUAL-GIST.md`
- `docs/RECOVERY.md`
- `scripts/verify-docs.sh`
- `packages/agent-badge/src/cli/main.ts` if command descriptions need alignment

### 27-03: Registry and clean-temp smoke proof for minimal repo artifacts

**Goal:** Finish MIG-02 by making release-proof smoke verification assert the current initializer contract, not the historical repo-local contract.

**What to build:**
- Update `scripts/smoke/verify-registry-install.sh` so the initializer path checks for `.agent-badge/*`, hook content, and other repo-owned artifacts, while explicitly asserting the absence of repo-local runtime ownership by default (no `node_modules/.bin/agent-badge` requirement, no managed runtime manifest ownership, no `npx --no-install` expectation after init). [VERIFIED: scripts/smoke/verify-registry-install.sh][ASSUMED]
- Keep direct runtime install proof as a distinct path. `scripts/smoke/verify-packed-install.sh` can still validate tarball importability and direct runtime binaries, but it should not masquerade as proof that `npm init agent-badge@latest` leaves a repo-local runtime behind. [VERIFIED: scripts/smoke/verify-packed-install.sh][ASSUMED]
- Update release or clean-checkout entrypoints so the minimal-artifact initializer proof is part of the documented release story. [VERIFIED: package.json][VERIFIED: docs/maintainers/RELEASE.md][ASSUMED]

**Best file candidates:**
- `scripts/smoke/verify-registry-install.sh`
- `scripts/smoke/verify-packed-install.sh`
- `scripts/verify-clean-checkout.sh`
- `docs/maintainers/RELEASE.md`
- `packages/create-agent-badge/src/index.test.ts`
- `packages/agent-badge/src/commands/release-readiness-matrix.test.ts`

## Concrete File Guidance

### Legacy migration and repo-wiring seam
- `packages/core/src/init/runtime-wiring.ts` and `packages/core/src/init/runtime-wiring.test.ts` already encode the managed-entry pruning rules that protect user-owned manifest content; preserve these invariants while expanding migration proof. [VERIFIED: files]
- `packages/agent-badge/src/commands/init.ts` and `packages/agent-badge/src/commands/init.test.ts` already contain migration reporting, badge-URL continuity checks, and legacy-rerun convergence behavior. Extend these rather than building a new migration layer. [VERIFIED: files]
- `packages/agent-badge/src/commands/uninstall.ts` and `packages/agent-badge/src/commands/uninstall.test.ts` already remove both shared and legacy managed hook blocks while preserving custom lines and default config/state retention. [VERIFIED: files]

### Shared publish migration signals
- `packages/agent-badge/src/commands/publish.test.ts`, `packages/agent-badge/src/commands/refresh.test.ts`, `packages/agent-badge/src/commands/status.test.ts`, and `packages/core/src/diagnostics/doctor.test.ts` already exercise `Migration: legacy -> shared`, `legacy-no-contributors`, and original-publisher recovery guidance. Phase 27 should turn these into a more coherent migration-proof story, not rewrite them from scratch. [VERIFIED: files]

### Public docs and proof surfaces
- `README.md`, `docs/INSTALL.md`, `docs/QUICKSTART.md`, `docs/CLI.md`, `docs/HOW-IT-WORKS.md`, `docs/TROUBLESHOOTING.md`, `docs/CONFIGURATION.md`, `docs/AUTH.md`, `docs/FAQ.md`, and `docs/UNINSTALL.md` still contain stale repo-local instructions or messaging. [VERIFIED: files]
- `scripts/smoke/verify-registry-install.sh` still asserts the old initializer outcome, while `scripts/smoke/verify-packed-install.sh` proves only the direct package install path. [VERIFIED: files]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Legacy migration | A second migration state file or new one-off conversion command. [ASSUMED] | Reuse `applyMinimalRepoScaffold()`, existing migration reporting, and the shared-mode recovery model already in init, refresh, publish, status, and doctor. [VERIFIED: code files above] | The repo already has the right primitives; the missing work is stronger end-to-end proof and clearer operator guidance. [VERIFIED: code and docs inspection] |
| Initializer proof | A smoke test that passes only because `npm init` or npm cache happens to leave a runnable local binary behind. [VERIFIED: scripts/smoke/verify-registry-install.sh] | Assert repo-owned artifacts and shared-hook content directly, and treat direct runtime install as a separate proof path. [ASSUMED] | Phase 27 must prove the new contract, not the old side effect. [VERIFIED: .planning/REQUIREMENTS.md] |
| Docs cleanup | Piecemeal wording changes that leave some pages saying "shared runtime" and others saying "repo-local wrapper". [ASSUMED] | Rewrite the user-facing command story as one consistent shared-runtime/global-first model, then update `scripts/verify-docs.sh` to lock it in. [VERIFIED: docs drift above][ASSUMED] | Mixed docs would make migration look unsafe even if the code is correct. [ASSUMED] |

## Common Pitfalls

### Pitfall 1: Treating direct runtime install proof as initializer proof
**What goes wrong:** smoke verification passes because `./node_modules/.bin/agent-badge` exists after a direct package install, but the initializer path still has not been checked for minimal repo artifacts. [VERIFIED: scripts/smoke/verify-packed-install.sh][VERIFIED: scripts/smoke/verify-registry-install.sh]  
**How to avoid:** keep "direct runtime install" and "npm initializer default behavior" as separate smoke contracts. [ASSUMED]

### Pitfall 2: Reintroducing repo-local fallback language in docs or examples
**What goes wrong:** docs tell users to use `npx --no-install` or describe init as installing a repo-local runtime, even though the code now expects a shared runtime on PATH after initialization. [VERIFIED: README.md][VERIFIED: docs/INSTALL.md][VERIFIED: docs/QUICKSTART.md][VERIFIED: docs/CLI.md]  
**How to avoid:** centralize around the shared-runtime story, preserve direct-install instructions only as an explicit alternative, and update fixed-string docs verification. [ASSUMED]

### Pitfall 3: Expanding migration cleanup beyond tool-owned artifacts
**What goes wrong:** migration or uninstall cleanup removes a user-owned `@legotin/agent-badge` dependency or unrelated scripts because the proof work weakens the ownership checks added in Phase 26. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/core/src/init/runtime-wiring.test.ts]  
**How to avoid:** keep the "managed scripts prove ownership" rule intact and add regression coverage any time migration tests expand. [VERIFIED: packages/core/src/init/runtime-wiring.test.ts]

### Pitfall 4: Documenting migration as complete without the original-publisher continuity step
**What goes wrong:** a team migrates from legacy single-writer publish state on the wrong machine and badge continuity becomes misleading even though local repo wiring looks correct. [VERIFIED: docs/MANUAL-GIST.md][VERIFIED: docs/HOW-IT-WORKS.md][VERIFIED: docs/RECOVERY.md]  
**How to avoid:** preserve and strengthen the original-publisher-machine guidance in docs, status, and doctor messaging. [ASSUMED]

## Open Questions (Resolved)

1. **Does Phase 27 need a new migration mechanism in code?**  
   Resolution: no. The current code already has migration-aware cleanup and migration reporting. Phase 27 should prove and expose those behaviors more clearly rather than add a second migration mechanism. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/agent-badge/src/commands/publish.test.ts][VERIFIED: packages/agent-badge/src/commands/refresh.test.ts]

2. **Should direct runtime tarball smoke keep using local binaries?**  
   Resolution: yes, but only as proof for explicit direct runtime installation. It must not be treated as evidence that the npm initializer creates or should create repo-local runtime ownership by default. [VERIFIED: scripts/smoke/verify-packed-install.sh][ASSUMED]

3. **Should public docs still mention direct local package installation?**  
   Resolution: yes, as an explicit alternative path. The default path must be `npm init agent-badge@latest` plus a shared runtime/global or user-scoped install model, not "repo-local runtime by default." [VERIFIED: .planning/REQUIREMENTS.md][ASSUMED]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | `vitest` temp-repo or fixture integration tests, root docs verification, and shell smoke scripts. [VERIFIED: package.json] |
| Config file | Root workspace scripts plus `packages/core/src/init/runtime-wiring.test.ts`, `packages/agent-badge/src/commands/init.test.ts`, `packages/agent-badge/src/commands/uninstall.test.ts`, `packages/agent-badge/src/commands/status.test.ts`, `packages/agent-badge/src/commands/doctor.test.ts`, `packages/agent-badge/src/commands/refresh.test.ts`, `packages/agent-badge/src/commands/publish.test.ts`, `packages/agent-badge/src/commands/release-readiness-matrix.test.ts`, and `packages/create-agent-badge/src/index.test.ts`. [VERIFIED: files][VERIFIED: package.json] |
| Quick run command | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts` [ASSUMED] |
| Full suite command | `npm run docs:check && npm run typecheck && npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/create-agent-badge/src/index.test.ts && bash -n scripts/smoke/verify-registry-install.sh && bash -n scripts/smoke/verify-packed-install.sh` [ASSUMED] |
| Estimated runtime | ~60-120 seconds for local proof, plus manual release-smoke time when validating a published version. [ASSUMED] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| MIG-01 | Legacy repos converge from managed repo-local package scripts, dependencies, and hook blocks to the shared-runtime/minimal-artifact model without breaking init, refresh, publish, status, doctor, or uninstall behavior. [VERIFIED: .planning/REQUIREMENTS.md] | integration + regression [ASSUMED] | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/doctor.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/publish.test.ts -x` [ASSUMED] | `✅` files exist, but they need a more coherent end-to-end migration matrix. [VERIFIED: files] |
| MIG-02 | Public docs, help text, uninstall guidance, and release-smoke proof all describe the shared-runtime/global-first model and prove no repo-local runtime artifacts appear by default after `npm init agent-badge@latest`. [VERIFIED: .planning/REQUIREMENTS.md] | docs + smoke + regression [ASSUMED] | `npm run docs:check && npm test -- --run packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/create-agent-badge/src/index.test.ts -x && bash -n scripts/smoke/verify-registry-install.sh && bash -n scripts/smoke/verify-packed-install.sh` [ASSUMED] | `✅` files exist, but current docs and registry smoke still encode the old repo-local contract. [VERIFIED: docs and scripts above] |

### Sampling Rate

- **After legacy cleanup or migration-flow changes:** run the quick test command plus the most directly affected command tests before touching docs or smoke scripts. [ASSUMED]
- **After publish or recovery wording changes:** re-run `status`, `doctor`, `publish`, and `refresh` tests together so migration messaging remains consistent across commands. [ASSUMED]
- **After docs or CLI-help changes:** run `npm run docs:check` and re-read any output examples backed by command tests. [ASSUMED]
- **After smoke-script changes:** run `bash -n scripts/smoke/verify-registry-install.sh` and `bash -n scripts/smoke/verify-packed-install.sh` before broader suite reruns. [ASSUMED]
- **Before `/gsd-verify-work`:** the full local suite must be green, and a manual published-version smoke or clean temp proof must be recorded for the initializer path. [ASSUMED]
- **Max feedback latency:** 120 seconds for local automated feedback. [ASSUMED]

### Wave 0 Gaps

- [x] Existing fixture and temp-repo tests already cover the migration-sensitive seams: init, publish, refresh, status, doctor, uninstall, and managed repo-wiring cleanup. [VERIFIED: files above]
- [x] Existing docs verification and shell smoke scripts are sufficient infrastructure; they need expectation updates, not replacement frameworks. [VERIFIED: package.json][VERIFIED: scripts/verify-docs.sh][VERIFIED: smoke scripts]
- [ ] Real registry smoke still depends on a published version and external npm resolution, so the final release-proof step remains a manual or release-environment verification even after local syntax checks pass. [VERIFIED: docs/maintainers/RELEASE.md][ASSUMED]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V1 Architecture / design | yes. [VERIFIED: roadmap and current milestone split] | Preserve the Phase 25 shared-runtime contract and Phase 26 minimal-artifact contract while adding migration proof. [ASSUMED] |
| V5 Input and integrity controls | yes. [VERIFIED: packages/core/src/init/runtime-wiring.ts] | Continue removing only tool-owned manifest or hook entries and preserve unrelated user-owned content. [VERIFIED: runtime-wiring rules and tests] |
| V8 Data protection | yes. [VERIFIED: AGENTS.md] | Keep migration, docs, and smoke evidence privacy-safe; do not print local paths or raw session data. [ASSUMED] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Migration cleanup deletes user-owned manifest content while proving legacy convergence. [VERIFIED: Phase 26 risk history and runtime-wiring tests] | Tampering [ASSUMED] | Preserve the existing managed-ownership checks and add migration regressions around mixed user-owned manifests. [ASSUMED] |
| Stale docs tell operators to use repo-local wrappers or rely on binaries that no longer exist after default init. [VERIFIED: docs drift above] | Reliability / drift [ASSUMED] | Update all user-facing docs and lock the shared-runtime vocabulary into docs verification. [ASSUMED] |
| Smoke verification passes on the wrong contract and falsely certifies a release. [VERIFIED: scripts/smoke/verify-registry-install.sh] | Integrity / false proof [ASSUMED] | Split runtime-install proof from initializer proof and assert the absence of repo-local runtime artifacts explicitly. [ASSUMED] |

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` - Phase 27 goal, plan titles, and milestone boundary. [VERIFIED: .planning/ROADMAP.md]
- `.planning/REQUIREMENTS.md` - MIG-01 and MIG-02 definitions. [VERIFIED: .planning/REQUIREMENTS.md]
- `.planning/STATE.md` - current focus and carryover from Phases 25-26. [VERIFIED: .planning/STATE.md]
- `.planning/phases/25-global-runtime-contract-and-command-resolution/25-RESEARCH.md` and `25-02-SUMMARY.md` - shared-runtime boundary and compatibility intent. [VERIFIED: files]
- `.planning/phases/26-minimal-repo-scaffold-and-init-rewire/26-RESEARCH.md` and `26-VERIFICATION.md` - minimal-artifact contract and explicit Phase 27 carryover. [VERIFIED: files]
- `packages/core/src/init/runtime-wiring.ts` and `packages/core/src/init/runtime-wiring.test.ts` - exact managed cleanup and preservation rules. [VERIFIED: files]
- `packages/agent-badge/src/commands/init.ts` and `packages/agent-badge/src/commands/init.test.ts` - migration reporting, badge continuity, and legacy rerun convergence. [VERIFIED: files]
- `packages/agent-badge/src/commands/publish.test.ts` and `packages/agent-badge/src/commands/refresh.test.ts` - first shared-write migration reporting. [VERIFIED: files]
- `packages/agent-badge/src/commands/status.ts`, `packages/agent-badge/src/commands/status.test.ts`, and `packages/core/src/diagnostics/doctor.test.ts` - legacy shared-mode recovery signals and original-publisher guidance. [VERIFIED: files]
- `packages/agent-badge/src/commands/uninstall.ts` and `packages/agent-badge/src/commands/uninstall.test.ts` - uninstall defaults and legacy/shared hook cleanup. [VERIFIED: files]
- `README.md`, `docs/*.md`, and smoke scripts under `scripts/smoke/` - current operator-story and proof drift. [VERIFIED: files]

### Secondary (MEDIUM confidence)
- `package.json` - available validation entrypoints and current workspace scripts. [VERIFIED: package.json]

## Metadata

**Confidence breakdown:**
- Phase boundary and remaining gaps: HIGH. The roadmap, requirements, prior phase artifacts, and current docs or smoke drift all agree on what Phase 27 still owns. [VERIFIED: roadmap, requirements, docs, smoke scripts]
- Migration implementation direction: HIGH. The code already exposes the migration primitives Phase 27 should build on. [VERIFIED: code files above]
- Validation strategy: MEDIUM-HIGH. Existing tests and scripts cover the right seams, but the final initializer proof still depends on a real published-version smoke path. [VERIFIED: package.json][VERIFIED: docs/maintainers/RELEASE.md][ASSUMED]

**Research date:** 2026-04-09. [VERIFIED: environment context]  
**Valid until:** 2026-05-09 for planning purposes, unless release-smoke behavior or public docs change again first. [ASSUMED]
