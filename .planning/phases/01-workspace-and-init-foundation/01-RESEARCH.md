# Phase 1 Research: Workspace and Init Foundation

**Phase:** 1
**Goal:** Deliver the repository structure, local runtime wiring, and init preflight/scaffolding needed for every later feature.
**Requirements:** BOOT-01, BOOT-02, BOOT-03, BOOT-04
**Researched:** 2026-03-30
**Confidence:** HIGH

## Planning Question

What needs to be true for Phase 1 plans to set up the workspace and `init` foundation correctly without pulling later-phase publishing and attribution work forward?

## Repo Reality

- The repository is effectively greenfield: only `AGENTS.md`, `LICENSE`, `.git`, and `.planning/` exist.
- Project-level research already locked in the core stack: Node.js 24 LTS with support for Node 20+, TypeScript 5, npm workspaces, `commander`, `zod`, `vitest`, `tsx`, and `@changesets/cli`.
- The product architecture is intentionally split into a runtime CLI package, an npm initializer package, and shared core services.
- The primary Phase 1 risk is not missing functionality. It is building the foundation in a way that later phases can extend without rewriting the package layout, init path, or state model.

## Phase Boundary

### In Scope

- Create the monorepo/package skeleton and shared tooling baseline.
- Define the shared config, state, and log schemas for `.agent-badge/`.
- Establish the repo-local runtime invocation strategy used by package scripts and git hooks.
- Implement `init` preflight checks for git state, README presence, package manager, provider path availability, and GitHub auth readiness.
- Implement minimal scaffolding that creates `.agent-badge/config.json`, `.agent-badge/state.json`, `.agent-badge/cache/`, and `.agent-badge/logs/`.
- Make the Phase 1 init path idempotent for re-runs on already-initialized repositories.

### Explicitly Out of Scope

- Provider parsing under `~/.codex` or `~/.claude` beyond preflight detection.
- Historical backfill or attribution scoring.
- Gist creation, publish payload generation, or README badge insertion.
- `refresh`, `status`, `config`, `doctor`, and `uninstall` command behavior beyond stubs or wiring needed by the foundation.

## Recommended Delivery Shape

Phase 1 should stay aligned to the roadmap’s three plans. The clean split is:

### 01-01: Workspace and Tooling Baseline

Create the npm workspace, the package skeletons, the shared TypeScript configuration, the root test harness, and release/tooling scaffolding.

**Why first:** Every later phase depends on stable package boundaries and predictable root commands.

### 01-02: Shared Schemas and Runtime Wiring

Implement the `.agent-badge` domain primitives: config/state/log schemas, filesystem helpers, and the repo-local runtime invocation strategy used by scripts and hooks.

**Why second:** Init scaffolding should write validated files and reference a real local runtime contract, not ad hoc string paths.

### 01-03: Init Preflight and Scaffolding

Implement the `init` command flow for repository detection, git bootstrap handling, provider/auth preflight, and idempotent `.agent-badge` scaffolding.

**Why third:** Preflight behavior needs the workspace structure from 01-01 and the schemas/runtime contract from 01-02.

## Recommended Project Structure

Keep the structure from the architecture research and do not collapse it for short-term speed:

```text
packages/
|- agent-badge/
|  |- package.json
|  |- src/
|  |  |- cli/
|  |  |- commands/
|  |  `- index.ts
|- create-agent-badge/
|  |- package.json
|  |- src/
|  |  `- index.ts
|- core/
|  |- package.json
|  |- src/
|  |  |- config/
|  |  |- init/
|  |  |- repo/
|  |  `- runtime/
`- testkit/
   |- package.json
   `- src/
```

At the repo root, Phase 1 should also establish:

- `package.json` with npm workspaces and shared scripts
- `tsconfig.base.json`
- `vitest.config.ts`
- `.gitignore`
- `.npmrc` only if required by workspace behavior
- `.changeset/` baseline if release tooling is included in this phase

## Implementation Guidance

### Workspace and Build Strategy

- Keep the repository ESM-first to match the researched stack and avoid later interop churn with `octokit`.
- Use one root TypeScript baseline that packages extend, rather than duplicating compiler settings.
- Prefer root scripts that target workspace packages consistently:
  - `build`
  - `test`
  - `lint` only if it can be maintained immediately
  - `typecheck`
  - package-specific dev entrypoints where useful
- Ensure both `packages/agent-badge` and `packages/create-agent-badge` can run locally without a global install.

### Runtime Invocation Strategy

Phase 1 needs a clear answer for BOOT-03. The recommended contract is:

- The runtime package exports a local CLI binary through `packages/agent-badge/package.json`.
- The initializer wires the target repo to invoke the installed local package binary, not a globally installed command.
- Hook and script integration should call stable local entrypoints through package-manager-aware commands rather than hardcoded global paths.
- Shared helpers in `packages/core` should resolve the package manager and generate the command strings used later by `init`, `refresh`, and hook installation.

This keeps runtime execution reproducible across machines and avoids global-install drift.

### Config and State Model

Phase 1 should define minimal but future-safe schemas with `zod`:

- `config.json`
  - enabled providers
  - badge display mode placeholder
  - publish target placeholder
  - refresh automation settings
  - privacy-safe defaults
- `state.json`
  - init status
  - scaffolding version
  - checkpoints placeholders
  - publish bookkeeping placeholders
  - ambiguity override placeholders
- log summary shape
  - timestamp
  - operation name
  - status
  - aggregate counters only

Do not persist raw provider payloads, transcript snippets, filenames, or local absolute paths in any schema.

### Init Preflight Contract

The preflight layer should collect facts first and decide on mutations second. The minimum Phase 1 checks are:

- Is the current directory already a git repo?
- If not, can git be initialized here, or should the command stop with a precise next step?
- Is there a README file, and where is it?
- Which package manager is present or most appropriate?
- Do `~/.codex` and `~/.claude` exist?
- Is GitHub auth likely available for later publish steps?
- Does `.agent-badge/` already exist, and which artifacts are already present?

The output of preflight should be a structured result object that later phases can extend, not a bundle of command-specific console text.

### Idempotency Rules

Phase 1 is the first place the non-idempotent setup pitfall can be prevented.

- Treat `init` as reconciliation, not one-shot installation.
- Create missing files/directories only when absent.
- Preserve existing user-managed values in config/state when safe.
- Record enough state to distinguish “already initialized” from “partially initialized”.
- Keep scaffolding writes deterministic so tests can compare re-run output safely.

## Testing and Verification Implications

Phase 1 should establish the testing baseline it expects later phases to extend.

### Test Targets

- Workspace commands resolve and execute from the root.
- Shared schemas reject invalid persisted shapes.
- Repo-local runtime command generation is stable across supported package managers.
- Init preflight reports git/README/provider/auth state without mutating the repo.
- Scaffolding creates the expected `.agent-badge` layout.
- Re-running scaffolding does not duplicate or corrupt state.

### Fixture Strategy

- Use temp directories for git/no-git repositories.
- Use fixture repos with and without README files.
- Stub provider directory presence rather than relying on the real home directory.
- Stub GitHub auth checks behind a small adapter boundary so tests stay offline.

## Risks to Carry Into Planning

### Risk 1: Over-scoping Phase 1

Because `init` is user-facing, it is easy to drag Gist creation, README mutation, or scanning into this phase. Do not do that. Phase 1 should stop at preflight plus scaffolding and leave publish behavior for later phases.

### Risk 2: Weak runtime wiring

If the plan leaves repo-local runtime invocation vague, later hook installation and refresh flows will either duplicate command-generation logic or hardcode package-manager assumptions.

### Risk 3: Schemas too narrow or too loose

If config/state schemas are too specific to Phase 1, later phases will rewrite them. If they are too permissive, invalid persisted state will leak into later workflows. Favor minimal required fields plus explicit placeholders for known later concerns.

### Risk 4: Idempotency bolted on after the fact

Init reconciliation logic needs to be part of the primary plan, not a cleanup step. Re-run safety is a Phase 1 success criterion.

## Planning Implications

The planner should enforce these outcomes:

- Plan `01-01` owns repo-root workspace files and package skeletons.
- Plan `01-02` owns shared domain models under `packages/core` plus the runtime-command strategy.
- Plan `01-03` owns init preflight/scaffolding behavior and tests for idempotent re-entry.
- `01-03` should depend on both `01-01` and `01-02`.
- `01-01` and `01-02` can reasonably run in parallel once the workspace root exists, but because the repo starts empty, the planner may still keep them sequential if shared root files would otherwise conflict.
- Every plan must name the concrete files it modifies; the repo is too empty for vague placeholders.

## Validation Architecture

Phase 1 should create the repository’s baseline test infrastructure and immediately use it for scaffold and schema coverage.

### Framework

- **Framework:** `vitest`
- **Config file:** `vitest.config.ts`
- **Quick run command:** `npm test -- --run`
- **Full suite command:** `npm test -- --run`
- **Estimated runtime:** under 30 seconds for Phase 1

### Expected Coverage by Plan

- **01-01:** workspace scripts, package manifests, TypeScript config, Vitest config, and a passing smoke test entrypoint
- **01-02:** schema validation tests and runtime invocation helper tests
- **01-03:** init preflight and scaffolding tests using temp directories and repeat-run assertions

### Wave 0 Requirement

Wave 0 for this phase is simply “install the test harness while creating the workspace baseline”. No separate pre-phase testing setup plan is needed if `01-01` establishes Vitest, shared fixtures, and root scripts before the later plans rely on them.

### Manual-Only Verification

Manual verification should be minimal in Phase 1. The core outcomes are filesystem and command behaviors that should be automated through tests.

## Recommended Planner Bias

- Prefer concrete file paths over abstract “foundation” tasks.
- Prefer thin command modules and shared services over large command files.
- Prefer deterministic helper functions that can be fixture-tested over shell-heavy orchestration embedded directly in commands.
- Bias toward explicit adapter boundaries for git, package manager, provider path checks, and GitHub auth checks so offline tests remain possible.

## Definition of a Good Phase 1 Plan

A good Phase 1 plan will make all of these true:

- The repository becomes a runnable npm workspace with the three-package split plus test support.
- There is one validated source of truth for `.agent-badge/config.json` and `.agent-badge/state.json`.
- `agent-badge init` can inspect a target repo and produce a structured preflight result before making changes.
- Scaffolding is deterministic and safe to re-run.
- Nothing in the plan depends on raw provider parsing, attribution, or Gist publishing.

---
*Research completed: 2026-03-30*
*Ready for planning: yes*
