# Phase 26: Minimal Repo Scaffold And Init Rewire - Research

**Researched:** 2026-04-08 [VERIFIED: environment context]  
**Domain:** Global-first initializer behavior, minimal repo-owned scaffold reconciliation, and idempotent cleanup of legacy repo-local runtime artifacts. [VERIFIED: .planning/ROADMAP.md]  
**Confidence:** MEDIUM-HIGH. [ASSUMED]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| DIST-01 | Developer can install `agent-badge` once at global or user scope and reuse that CLI across repositories without adding `@legotin/agent-badge` to each repo's dependencies. [VERIFIED: .planning/REQUIREMENTS.md] | Remove the post-init repo-local install step from `packages/create-agent-badge/src/index.ts` and stop writing managed runtime dependency entries from the init/config reconciliation path. [VERIFIED: packages/create-agent-badge/src/index.ts][VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/config.ts] |
| DIST-02 | `npm init agent-badge@latest` initializes the current repository without creating repo-local `node_modules` or adding the runtime package to the repo manifest or lockfile by default. [VERIFIED: .planning/REQUIREMENTS.md] | Replace the current package.json-centric runtime writer with a minimal repo-scaffold reconciler that keeps `.agent-badge/`, `.gitignore`, README badge insertion, and optional hook content, but does not create package manifests or install the runtime package. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/core/src/init/scaffold.ts] |
| ART-01 | After init, the repo only contains repo-specific agent-badge artifacts needed for operation: `.agent-badge/` data, README badge markup, gitignore entries, and optional git hook content. [VERIFIED: .planning/REQUIREMENTS.md] | Keep `applyAgentBadgeScaffold()` as the source of truth for `.agent-badge/*`, keep README badge management in `runInitCommand()`, keep managed `.gitignore` and `pre-push` support, and remove package.json scripts plus repo-local runtime dependency from the default scaffold. [VERIFIED: packages/core/src/init/scaffold.ts][VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/core/src/init/runtime-wiring.ts] |
| ART-02 | Re-running init remains idempotent under the new model and does not duplicate hook blocks, README badges, or repo-owned config while keeping the artifact footprint minimal. [VERIFIED: .planning/REQUIREMENTS.md] | Re-runs must converge on one README marker block, one managed hook block, one managed gitignore block, and no managed runtime dependency/script entries even when a repo was initialized under the legacy repo-local model. [VERIFIED: .planning/ROADMAP.md][VERIFIED: packages/core/src/publish/readme-badge.ts][VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts] |
</phase_requirements>

## Project Constraints (from AGENTS.md and milestone planning)

- Setup must still feel initializer-first from `npm init agent-badge@latest`; Phase 26 cannot turn global runtime installation into a hard precondition for writing repo-owned scaffold. [VERIFIED: AGENTS.md][VERIFIED: .planning/ROADMAP.md]
- The repo remains local-first and privacy-preserving, so any new init/config messaging must stay aggregate-only and must not leak machine-local paths or transcript details. [VERIFIED: AGENTS.md]
- Init is explicitly idempotent, so the Phase 26 implementation must converge on one managed README block, one managed hook block, and one minimal artifact set across reruns. [VERIFIED: AGENTS.md][VERIFIED: .planning/REQUIREMENTS.md]
- Phase 25 already established the shared PATH-based runtime contract and direct managed hook contract; Phase 26 must consume that contract, not redesign it. [VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-RESEARCH.md][VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-02-SUMMARY.md]
- Phase 27 still owns legacy migration UX, uninstall/docs/readme/help cleanup, and release-proof smoke coverage; Phase 26 should stop at initializer/scaffold behavior plus repo-artifact convergence. [VERIFIED: .planning/ROADMAP.md]

## Summary

The codebase still treats repo-local runtime ownership as part of initialization. `packages/create-agent-badge/src/index.ts` calls `runInitCommand()` and then immediately shells out to install `@legotin/agent-badge` into the target repo, reading the dependency specifier back out of `package.json`. `packages/core/src/init/runtime-wiring.ts` creates or mutates `package.json`, writes managed `agent-badge:init` and `agent-badge:refresh` scripts, adds `@legotin/agent-badge` to `devDependencies`, manages `.gitignore`, and writes the direct shared-runtime `pre-push` hook. `packages/agent-badge/src/commands/config.ts` reuses that same runtime-wiring path whenever refresh settings change, so config mutations can recreate repo-local runtime artifacts even if init stops doing so. [VERIFIED: packages/create-agent-badge/src/index.ts][VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/config.ts]

Phase 25 intentionally stopped short of removing those artifacts. Its research and summary explicitly reserve repo-local dependency removal, manifest cleanup, and initializer rewiring for Phase 26. That means Phase 26 should not merely delete `installRepoLocalRuntime()` from the initializer. It also needs a new minimal repo-scaffold reconciliation path in core, then it must rewire both `init` and `config` to use that new path so the tool no longer recreates package.json state during normal operation. [VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-RESEARCH.md][VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-02-SUMMARY.md]

The main design tension is the product promise that `npm init agent-badge@latest` remains one-command onboarding while the runtime becomes global-first. The existing Phase 25 operator flow already resolves that tension: init may finish repo setup even when the shared runtime is missing, but it reports the shared-runtime prerequisite instead of silently vendoring a repo-local binary. Inference: Phase 26 should preserve that behavior while removing repo-local dependency ownership. Init should still scaffold `.agent-badge/`, README badge markup, gitignore entries, and optional hook content, but it should no longer create a `package.json`, add `@legotin/agent-badge`, or create a repo-local `node_modules` path just to make follow-up commands work. [VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts][ASSUMED]

**Primary recommendation:** Introduce a minimal repo-scaffold reconciler in core that manages only repo-owned artifacts (`.gitignore`, `pre-push`, and cleanup of managed legacy package.json entries when they already exist), switch both `runInitCommand()` and `runConfigCommand()` to that reconciler, and make `create-agent-badge` a pure initializer entrypoint that never performs a post-init package-manager install. Use idempotent legacy cleanup on rerun to converge old repos toward the minimal-artifact model without bundling full migration or uninstall UX into this phase. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/agent-badge/src/commands/config.ts][ASSUMED]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| Node.js built-ins (`node:fs`, `node:path`, `node:child_process`) | Repo engines are `^20 || ^22 || ^24`. [VERIFIED: package.json] | Reconcile repo files, preserve idempotent shell hook output, and remove the initializer's post-init install shell-out. [VERIFIED: packages/create-agent-badge/src/index.ts][VERIFIED: packages/core/src/init/runtime-wiring.ts] | Phase 26 is file-reconciliation work on top of the existing CLI, not a dependency problem. [VERIFIED: package.json] |
| TypeScript | Repo range `^5.0.0`. [VERIFIED: package.json] | Encode a new minimal-scaffold result shape and keep init/config call sites type-safe. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/agent-badge/src/commands/config.ts] | The repo already models scaffold/runtime boundaries with shared interfaces; Phase 26 should extend that pattern instead of adding loose shell scripts. [VERIFIED: package.json][VERIFIED: packages/core/src/init/scaffold.ts] |
| `vitest` | Repo range `^3.2.0`. [VERIFIED: package.json] | Temp-repo integration tests already cover init/config/runtime-wiring behaviors and should remain the main proof surface. [VERIFIED: packages/core/src/init/runtime-wiring.test.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts][VERIFIED: packages/agent-badge/src/commands/config.test.ts][VERIFIED: packages/create-agent-badge/src/index.test.ts] | Existing tests already exercise the relevant seams; the work is changing expectations and adding cases, not introducing a new framework. [VERIFIED: codebase files listed above] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| A new minimal repo-scaffold reconciler that owns hook/gitignore plus legacy managed-entry cleanup. [ASSUMED] | Keep `applyRepoLocalRuntimeWiring()` and add flags to skip package.json writes. [VERIFIED: packages/core/src/init/runtime-wiring.ts] | This risks keeping "repo-local runtime wiring" semantics in the default path and makes it too easy for `config` or future callers to recreate managed dependency/script entries accidentally. [ASSUMED] |
| A pure `create-agent-badge` initializer that delegates only to `runInitCommand()`. [ASSUMED] | Keep the post-init install step but try to hide it from repo state. [VERIFIED: packages/create-agent-badge/src/index.ts] | That still creates repo-local `node_modules` churn and keeps DIST-02 false in practice. [VERIFIED: .planning/REQUIREMENTS.md][ASSUMED] |
| Legacy cleanup on rerun that removes only managed agent-badge keys and preserves user-owned package.json content. [ASSUMED] | Use `removeRepoLocalRuntimeWiring()` directly during init reruns. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/uninstall.ts] | Uninstall-oriented removal also strips hook and gitignore blocks that Phase 26 still needs, so it is the wrong abstraction for normal init/config reconciliation. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/uninstall.ts] |

## Architecture Patterns

### Pattern 1: Pure Initializer Entry Point
**What:** `create-agent-badge` should become a thin delegator around `runInitCommand()` with no repo-local runtime installation, no package.json read-after-write dependency, and no package-manager-specific install matrix after init completes. [VERIFIED: packages/create-agent-badge/src/index.ts][ASSUMED]

**When to use:** Apply this to the `npm init agent-badge@latest` entrypoint so DIST-01 and DIST-02 are satisfied at the actual initializer boundary instead of only inside core abstractions. [VERIFIED: .planning/REQUIREMENTS.md]

**Why:** The current initializer fails Phase 26 directly because it cannot succeed without package.json wiring and then shells out to install `@legotin/agent-badge` locally. Removing only the install call is not enough if the core init path still creates managed dependency/script entries. [VERIFIED: packages/create-agent-badge/src/index.ts][VERIFIED: packages/core/src/init/runtime-wiring.ts]

### Pattern 2: Minimal Repo-Owned Scaffold Writer
**What:** Replace the default init/config wiring path with a repo-artifact reconciler that manages `.gitignore`, optional `pre-push` hook content, and cleanup of legacy managed package.json entries when present, but never creates package.json solely for agent-badge. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/config.ts][ASSUMED]

**When to use:** `runInitCommand()` and `runConfigCommand()` should both use the same minimal writer so refresh-mode toggles and reruns cannot reintroduce repo-local runtime ownership. [VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/agent-badge/src/commands/config.ts]

**Why:** Today the tool has one core writer and `config` reuses it. If Phase 26 only changes `init`, `config set refresh.prePush.*` will recreate the managed dependency and script artifacts immediately. [VERIFIED: packages/agent-badge/src/commands/config.ts][VERIFIED: packages/core/src/init/runtime-wiring.ts]

### Pattern 3: Legacy-Aware Convergence Without Full Migration UX
**What:** On rerun, remove only the managed `package.json#devDependencies.@legotin/agent-badge`, `package.json#scripts.agent-badge:init`, and `package.json#scripts.agent-badge:refresh` entries if they are present, preserve user-owned scripts/dependencies, and optionally delete a package.json file only when it becomes empty after removing tool-owned content. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts][ASSUMED]

**When to use:** Use this during Phase 26 init/config reconciliation for repos previously bootstrapped under the repo-local model. [VERIFIED: .planning/ROADMAP.md]

**Why:** ART-02 explicitly requires reruns to keep the artifact footprint minimal even in already-initialized repos, but Phase 27 still owns explicit migration/uninstall flows and release-proof messaging. Convergence on rerun is therefore in scope; standalone migration UX is not. [VERIFIED: .planning/ROADMAP.md][VERIFIED: .planning/REQUIREMENTS.md]

### Pattern 4: Shared Runtime Messaging Survives the Artifact Cleanup
**What:** Preserve the Phase 25 shared-runtime status/reporting contract while removing repo-local runtime ownership. [VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-02-SUMMARY.md][VERIFIED: packages/agent-badge/src/commands/init.ts]

**When to use:** Init/config output after Phase 26 should still tell the operator whether the shared runtime is on `PATH`, but that message should no longer coexist with repo-local dependency creation. [VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/agent-badge/src/commands/config.ts]

**Why:** The one-command onboarding promise still holds if init finishes repo setup and reports the missing shared runtime clearly. It fails if the product silently falls back to repo-local runtime vendoring. [VERIFIED: AGENTS.md][VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-RESEARCH.md][ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Default init/config runtime ownership | Keep `applyRepoLocalRuntimeWiring()` as the default path and toggle package.json writes piecemeal. [VERIFIED: packages/core/src/init/runtime-wiring.ts] | Add a dedicated minimal scaffold reconciliation path with explicit legacy cleanup semantics. [ASSUMED] | The phase goal is not "repo-local runtime wiring with fewer writes"; it is "minimal repo scaffold." [VERIFIED: .planning/ROADMAP.md] |
| Initializer bootstrap | A second package-manager install matrix in `create-agent-badge`. [VERIFIED: packages/create-agent-badge/src/index.ts] | Let `npm init agent-badge@latest` bootstrap the repo and surface shared-runtime remediation through the runtime contract from Phase 25. [VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-02-SUMMARY.md] | Reinstalling the runtime locally defeats DIST-01 and DIST-02. [VERIFIED: .planning/REQUIREMENTS.md] |
| Legacy cleanup | Reuse uninstall's full removal semantics inside init/config. [VERIFIED: packages/agent-badge/src/commands/uninstall.ts] | Remove only managed package.json entries during normal reconciliation and leave explicit uninstall/migration behavior to later flows. [ASSUMED] | Init reruns still need hook/gitignore/config/state to remain healthy. [VERIFIED: .planning/REQUIREMENTS.md][VERIFIED: packages/core/src/init/scaffold.ts] |
| Phase scoping | Fold README/help/install docs, uninstall UX, and full release-proof smoke into Phase 26. [VERIFIED: .planning/ROADMAP.md] | Keep Phase 26 on code-path convergence and repo-artifact semantics; leave Phase 27 to migration/docs/release proof. [VERIFIED: .planning/ROADMAP.md] | The roadmap already split these concerns. [VERIFIED: .planning/ROADMAP.md] |

## Common Pitfalls

### Pitfall 1: Removing the Initializer Install Step but Leaving `config` on the Old Writer
**What goes wrong:** `npm init agent-badge@latest` stops installing `@legotin/agent-badge`, but `agent-badge config set refresh.prePush.*` recreates managed package.json entries and the repo-local dependency later. [VERIFIED: packages/agent-badge/src/commands/config.ts]
**Why it happens:** `config` still calls `applyRepoLocalRuntimeWiring()`, and that writer creates/updates `package.json` plus managed script/dependency entries. [VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/config.ts]
**How to avoid:** Make init and config share the same minimal scaffold reconciler. [ASSUMED]

### Pitfall 2: New Repos Stop Creating `package.json`, but Legacy Reruns Stay Dirty Forever
**What goes wrong:** Fresh repos are clean, but repos initialized under the old model keep `@legotin/agent-badge`, `agent-badge:init`, and `agent-badge:refresh` forever even after rerunning init. [VERIFIED: packages/agent-badge/src/commands/init.test.ts][VERIFIED: .planning/REQUIREMENTS.md]
**Why it happens:** The current writer only adds managed keys; it never converges them away during normal init/config flows. [VERIFIED: packages/core/src/init/runtime-wiring.ts]
**How to avoid:** Add managed-entry pruning during init/config reconciliation and test it explicitly against legacy fixtures. [ASSUMED]

### Pitfall 3: Over-Aggressive Cleanup Deletes User-Owned Manifest Content
**What goes wrong:** Init reruns remove real project scripts or dependencies while trying to clean up managed agent-badge fields. [ASSUMED]
**Why it happens:** Package.json cleanup is destructive if it is not limited to exact managed keys and exact managed values. [VERIFIED: packages/core/src/init/runtime-wiring.ts]
**How to avoid:** Remove only managed agent-badge keys, preserve unrelated content, and delete whole package.json only when nothing user-owned remains after pruning. [ASSUMED]

### Pitfall 4: Proof Surfaces Keep Asserting the Old Artifact Model
**What goes wrong:** Unit/integration behavior changes, but tests, smoke scripts, or docs still assert `@legotin/agent-badge` in repo manifests, `node_modules/.bin/agent-badge`, or repo-local install failures, so verification drifts or later phases inherit stale assumptions. [VERIFIED: packages/create-agent-badge/src/index.test.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts][VERIFIED: scripts/smoke/verify-registry-install.sh][VERIFIED: README.md]
**Why it happens:** Current proof layers were written for the repo-local install model. [VERIFIED: files above]
**How to avoid:** Update the tests that define the Phase 26 contract now, and defer public docs/release-proof surfaces intentionally only where the roadmap says Phase 27 owns them. [VERIFIED: .planning/ROADMAP.md][ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | A legacy package.json created solely by prior agent-badge wiring can be deleted safely if it becomes empty after removing managed keys. [ASSUMED] | Summary, Architecture Patterns, Open Questions | Phase 26 may leave an unnecessary empty manifest behind or, worse, delete a file the user expected to keep. |
| A2 | Phase 26 can defer broad docs/help/install copy updates to Phase 27 as long as init/config runtime messaging is already accurate. [ASSUMED] | Summary, Don't Hand-Roll, Validation Architecture | Reviewers may expect README/help alignment in the same phase and mark the plans incomplete. |
| A3 | Existing temp-repo Vitest coverage is sufficient to verify most Phase 26 behavior without introducing a new framework. [ASSUMED] | Standard Stack, Validation Architecture | The phase may under-budget proof work if a package-manager-level integration seam needs a new harness. |

## Open Questions (RESOLVED)

1. **Should Phase 26 delete a legacy package.json that exists only because prior agent-badge init created it?**  
   Resolution: yes, if removing the managed dependency/script keys leaves no user-owned content. This is the only way to satisfy the "minimal repo artifacts" requirement for legacy reruns without forcing the user to run uninstall first. Preserve the file whenever unrelated fields remain. [VERIFIED: .planning/REQUIREMENTS.md][VERIFIED: packages/core/src/init/runtime-wiring.ts][ASSUMED]

2. **Should `config` still rewrite managed hook content under the minimal-artifact model?**  
   Resolution: yes. Refresh-policy changes still belong to repo-owned scaffold, but the reconciler must stop recreating package.json runtime ownership while continuing to manage `.git/hooks/pre-push`. [VERIFIED: packages/agent-badge/src/commands/config.ts][VERIFIED: .planning/REQUIREMENTS.md][ASSUMED]

3. **Does Phase 26 need to absorb uninstall/docs/release-proof work to finish the global-first shift?**  
   Resolution: no. Phase 26 should converge init/config and repo artifacts. Phase 27 still owns migration UX, uninstall/documentation updates, and full release-proof smoke coverage. [VERIFIED: .planning/ROADMAP.md]

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | `vitest` temp-repo integration tests plus `tsc -b` typecheck. [VERIFIED: package.json][VERIFIED: packages/core/src/init/runtime-wiring.test.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts] |
| Config file | Repo scripts plus file-local tests in `packages/core/src/init/runtime-wiring.test.ts`, `packages/agent-badge/src/commands/init.test.ts`, `packages/agent-badge/src/commands/config.test.ts`, and `packages/create-agent-badge/src/index.test.ts`. [VERIFIED: package.json][VERIFIED: listed files] |
| Quick run command | `npm test -- --run packages/create-agent-badge/src/index.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts`. [VERIFIED: package.json][ASSUMED] |
| Full suite command | `npm run typecheck && npm test -- --run packages/create-agent-badge/src/index.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts && bash -n scripts/smoke/verify-registry-install.sh`. [VERIFIED: package.json][ASSUMED] |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| DIST-01 | `create-agent-badge` no longer installs `@legotin/agent-badge` into the target repo, and init/config do not reintroduce managed runtime dependency ownership. [VERIFIED: .planning/REQUIREMENTS.md] | integration [ASSUMED] | `npm test -- --run packages/create-agent-badge/src/index.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts -x` [ASSUMED] | `✅` files exist, but current assertions still expect repo-local install. [VERIFIED: packages/create-agent-badge/src/index.test.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts][VERIFIED: packages/agent-badge/src/commands/config.test.ts] |
| DIST-02 | Init on a repo without package.json or lockfiles leaves repo-local runtime artifacts absent by default. [VERIFIED: .planning/REQUIREMENTS.md] | integration [ASSUMED] | `npm test -- --run packages/create-agent-badge/src/index.test.ts packages/agent-badge/src/commands/init.test.ts -x` [ASSUMED] | `✅` files exist, but new cases must be added for package-json-free repos and node_modules absence. [VERIFIED: packages/create-agent-badge/src/index.test.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts] |
| ART-01 | Repo-owned artifacts after init are limited to `.agent-badge/*`, README badge markup, `.gitignore`, and optional managed hook content. [VERIFIED: .planning/REQUIREMENTS.md] | integration [ASSUMED] | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts -x` [ASSUMED] | `✅` existing files cover hook/gitignore/README semantics and need expectation updates. [VERIFIED: packages/core/src/init/runtime-wiring.test.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts] |
| ART-02 | Legacy reruns converge to the minimal artifact model without duplicating markers or deleting user-owned content. [VERIFIED: .planning/REQUIREMENTS.md] | integration + regression [ASSUMED] | `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/uninstall.test.ts -x` [ASSUMED] | `✅` files exist, but legacy-cleanup scenarios must be added. [VERIFIED: packages/core/src/init/runtime-wiring.test.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts][VERIFIED: packages/agent-badge/src/commands/config.test.ts][VERIFIED: packages/agent-badge/src/commands/uninstall.test.ts] |

### Sampling Rate
- **After initializer entrypoint changes:** Run `packages/create-agent-badge/src/index.test.ts` plus the affected init/config integration tests. [ASSUMED]
- **After core scaffold reconciliation changes:** Re-run `packages/core/src/init/runtime-wiring.test.ts` before broader command tests. [VERIFIED: packages/core/src/init/runtime-wiring.test.ts][ASSUMED]
- **After legacy-cleanup/idempotency changes:** Run the full suite command to ensure init/config/uninstall expectations agree on the same artifact contract. [ASSUMED]
- **Before `/gsd-verify-work`:** Full suite must be green and at least one legacy-rerun fixture must prove managed package.json cleanup without deleting unrelated content. [ASSUMED]
- **Max feedback latency:** 90 seconds. [ASSUMED]

### Wave 0 Gaps
- [ ] `packages/create-agent-badge/src/index.test.ts` still encodes repo-local install success/failure and needs a new pure-initializer contract. [VERIFIED: packages/create-agent-badge/src/index.test.ts]
- [ ] `packages/agent-badge/src/commands/init.test.ts` still expects managed package.json runtime entries and should add package-json-free plus legacy-rerun cleanup scenarios. [VERIFIED: packages/agent-badge/src/commands/init.test.ts]
- [ ] `packages/agent-badge/src/commands/config.test.ts` still assumes runtime-wiring mutations against package.json and needs minimal-scaffold expectations. [VERIFIED: packages/agent-badge/src/commands/config.test.ts]
- [ ] `scripts/smoke/verify-registry-install.sh` and `README.md` still describe or assert the repo-local artifact model; Phase 26 should document whether those surfaces stay temporarily stale by design or get narrowed to syntax-only guardrails until Phase 27. [VERIFIED: scripts/smoke/verify-registry-install.sh][VERIFIED: README.md]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---|---|---|
| V5 Input Validation | yes. [VERIFIED: packages/core/src/init/scaffold.ts][VERIFIED: packages/core/src/init/runtime-wiring.ts] | Keep cleanup logic limited to exact managed keys and preserve unrelated repo content by default. [ASSUMED] |
| V8 Data Protection | yes. [VERIFIED: AGENTS.md] | Keep runtime/setup messaging privacy-safe and do not print machine-local paths while removing repo-local runtime ownership. [VERIFIED: AGENTS.md][VERIFIED: packages/agent-badge/src/commands/init.ts] |

### Known Threat Patterns for This Stack
| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Removing user-owned package.json keys while pruning legacy managed entries. [ASSUMED] | Tampering [ASSUMED] | Match only tool-owned keys/values and preserve unrelated manifest content. [ASSUMED] |
| Silent recreation of repo-local runtime artifacts through non-init commands. [VERIFIED: packages/agent-badge/src/commands/config.ts] | Tampering / Drift [ASSUMED] | Rewire every normal scaffold writer (`init`, `config`) to the same minimal-artifact contract. [ASSUMED] |
| Misleading setup state when shared runtime is absent after repo-local fallback removal. [ASSUMED] | Reliability / DoS [ASSUMED] | Keep Phase 25 shared-runtime reporting and remediation intact in init/config output. [VERIFIED: packages/agent-badge/src/commands/init.ts][VERIFIED: packages/agent-badge/src/commands/config.ts] |

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` - Phase 26 goal, requirements, and explicit phase split from Phase 27. [VERIFIED: .planning/ROADMAP.md]
- `.planning/REQUIREMENTS.md` - DIST-01, DIST-02, ART-01, ART-02 definitions. [VERIFIED: .planning/REQUIREMENTS.md]
- `.planning/STATE.md` - current milestone focus and Phase 25 boundary reminder. [VERIFIED: .planning/STATE.md]
- `.planning/phases/25-global-runtime-contract-and-command-resolution/25-RESEARCH.md` - explicit statement that repo-local install removal belongs to Phase 26. [VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-RESEARCH.md]
- `.planning/phases/25-global-runtime-contract-and-command-resolution/25-02-SUMMARY.md` - Phase 25 closeout and boundary. [VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-02-SUMMARY.md]
- `packages/create-agent-badge/src/index.ts` and `packages/create-agent-badge/src/index.test.ts` - initializer still installs the runtime locally and tests prove that assumption. [VERIFIED: files]
- `packages/core/src/init/runtime-wiring.ts` and `packages/core/src/init/runtime-wiring.test.ts` - current managed package.json/script/dependency writes plus hook/gitignore behavior. [VERIFIED: files]
- `packages/core/src/init/scaffold.ts` - current repo-owned `.agent-badge/*` scaffold behavior. [VERIFIED: file]
- `packages/agent-badge/src/commands/init.ts` and `packages/agent-badge/src/commands/init.test.ts` - init still calls the repo-local writer and reports artifact results. [VERIFIED: files]
- `packages/agent-badge/src/commands/config.ts` and `packages/agent-badge/src/commands/config.test.ts` - config still reuses the repo-local writer. [VERIFIED: files]
- `packages/agent-badge/src/commands/uninstall.ts` - current full-removal abstraction boundary. [VERIFIED: file]
- `README.md` and `scripts/smoke/verify-registry-install.sh` - current public/proof surfaces still encode repo-local runtime assumptions. [VERIFIED: files]

### Secondary (MEDIUM confidence)
- None collected; the key findings came from direct roadmap and code inspection. [VERIFIED: files above]

## Metadata

**Confidence breakdown:**
- Requirements and phase boundaries: HIGH. They are directly stated in roadmap, requirements, and Phase 25 artifacts. [VERIFIED: .planning/ROADMAP.md][VERIFIED: .planning/REQUIREMENTS.md][VERIFIED: .planning/phases/25-global-runtime-contract-and-command-resolution/25-02-SUMMARY.md]
- Implementation recommendation: MEDIUM-HIGH. It follows directly from the current init/config/wiring seams, but exact cleanup rules for legacy empty package.json files still require planner precision. [VERIFIED: packages/create-agent-badge/src/index.ts][VERIFIED: packages/core/src/init/runtime-wiring.ts][VERIFIED: packages/agent-badge/src/commands/config.ts][ASSUMED]
- Validation strategy: MEDIUM. The current suite clearly covers the right seams, but several assertions must be rewritten from the old artifact model before it becomes a stable proof layer. [VERIFIED: packages/create-agent-badge/src/index.test.ts][VERIFIED: packages/agent-badge/src/commands/init.test.ts][VERIFIED: packages/agent-badge/src/commands/config.test.ts][ASSUMED]

**Research date:** 2026-04-08. [VERIFIED: environment context]  
**Valid until:** 2026-05-08 for planning purposes because the findings are codebase-local but may drift as Phase 26 begins implementation. [ASSUMED]
