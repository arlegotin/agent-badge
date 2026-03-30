---
phase: 01-workspace-and-init-foundation
verified: 2026-03-30T06:51:24Z
status: gaps_found
score: 3/5 must-haves verified
gaps:
  - truth: "Init can safely handle non-git directories by either bootstrapping git or blocking with a precise next action."
    status: failed
    reason: "`runInitCommand` scaffolds `.agent-badge` in a non-git directory when `allowGitInit` is true, but no shared init code ever runs `git init`."
    artifacts:
      - path: "packages/core/src/repo/git-context.ts"
        issue: "`getGitContext` returns `canInitialize: true` for non-git directories when `allowGitInit` is true, without performing bootstrap."
      - path: "packages/agent-badge/src/commands/init.ts"
        issue: "`runInitCommand` proceeds directly from preflight to `applyAgentBadgeScaffold` and never creates a git repository."
    missing:
      - "Implement shared git bootstrap in the init flow when non-git initialization is allowed, or block consistently until the directory becomes a git repo."
      - "Add an end-to-end test that asserts `.git/` exists after `runInitCommand({ allowGitInit: true })` in a non-git directory."
  - truth: "Init creates repo-local runtime wiring so package scripts or git hooks can invoke `agent-badge` after dependency install."
    status: failed
    reason: "The codebase contains package-manager-specific command builders, but the init path never writes package-script, dependency, or git-hook integration into the target repo."
    artifacts:
      - path: "packages/core/src/runtime/local-cli.ts"
        issue: "Exports canonical command strings only; no caller persists them into repo scripts or hooks."
      - path: "packages/core/src/init/scaffold.ts"
        issue: "Scaffold only creates `.agent-badge/*`; it does not modify `package.json` or install hook files."
    missing:
      - "Write repo-local runtime integration during init, such as package-manager-aware scripts and/or pre-push hook installation."
      - "Add integration tests that verify the target repo gains the expected runtime wiring after init."
---

# Phase 1: Workspace and Init Foundation Verification Report

**Phase Goal:** Deliver the repository structure, local runtime wiring, and init preflight/scaffolding needed for every later feature.
**Verified:** 2026-03-30T06:51:24Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Maintainer can run both workspace packages locally with one shared build/test setup. | ✓ VERIFIED | Root `package.json` defines shared workspace scripts, all four package manifests/entrypoints exist, `npm run typecheck` passed, and `npm test -- --run` passed with 7 files / 20 tests. |
| 2 | `agent-badge init` can detect git state, README presence, package manager, provider availability, and GitHub auth before mutating the repo. | ✓ VERIFIED | `packages/core/src/init/preflight.ts` assembles `git`, `readme`, `packageManager`, `providers`, `githubAuth`, and `existingScaffold`; `packages/core/src/init/preflight.test.ts` confirms non-mutating preflight behavior. |
| 3 | Init can safely handle non-git directories by either bootstrapping git or blocking with a precise next action. | ✗ FAILED | `packages/core/src/repo/git-context.ts` reports `canInitialize: true` for non-git directories when `allowGitInit` is true, but `packages/agent-badge/src/commands/init.ts` never calls `git init`; a temp-dir probe produced `{"gitExists":false,"scaffoldExists":true,"configExists":true}` after `runInitCommand({ allowGitInit: true })`. |
| 4 | Init creates the `.agent-badge` scaffold and repo-local runtime wiring without requiring a global install. | ✗ FAILED | `packages/core/src/init/scaffold.ts` creates `.agent-badge/config.json`, `.agent-badge/state.json`, `.agent-badge/cache/`, and `.agent-badge/logs/`, but a temp git-repo probe produced `{"packageJsonChanged":false,"prePushHookExists":false,"agentBadgeDirExists":true,"configExists":true,"stateExists":true}` after init. |
| 5 | Re-running init converges without duplicate scaffold output or silent overwrite of valid existing state. | ✓ VERIFIED | `packages/core/src/init/scaffold.test.ts` proves a second run creates nothing new, reuses existing artifacts, and preserves valid custom config/state values while filling missing defaults. |

**Score:** 3/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `package.json` | Root workspace configuration and shared scripts | ✓ VERIFIED | Substantive despite the plan's `min_lines` heuristic miss; contains `workspaces`, `build`, `test`, `typecheck`, and local dev scripts. |
| `tsconfig.base.json` | Shared TypeScript baseline for every package | ✓ VERIFIED | Defines strict NodeNext compiler settings plus path aliases used across the workspace. |
| `vitest.config.ts` | Root Vitest configuration for workspace tests | ✓ VERIFIED | Includes `packages/**/*.test.ts` and source aliases for local package imports. |
| `packages/agent-badge/package.json` | Runtime CLI package manifest with local bin entry | ✓ VERIFIED | Declares `agent-badge` package name, `bin.agent-badge`, and dependency on `@agent-badge/core`. |
| `packages/create-agent-badge/package.json` | Initializer package manifest | ✓ VERIFIED | Declares `create-agent-badge` name and bin entry for npm-init style invocation. |
| `packages/core/package.json` | Shared core package manifest | ✓ VERIFIED | Declares `@agent-badge/core` and its `zod` dependency. |
| `packages/testkit/package.json` | Shared fixture/test helper package manifest | ✓ VERIFIED | Declares `@agent-badge/testkit` export surface for offline fixtures. |
| `packages/core/src/config/config-schema.ts` | Zod schema and defaults for `.agent-badge/config.json` | ✓ VERIFIED | Strict aggregate-only config schema, defaults, and parser are present. |
| `packages/core/src/state/state-schema.ts` | Zod schema and defaults for `.agent-badge/state.json` | ✓ VERIFIED | Strict state schema includes checkpoints, publish state, and ambiguity overrides. |
| `packages/core/src/runtime/local-cli.ts` | Local CLI command builders for scripts and hooks | ✓ VERIFIED | Exact package-manager-specific command builders exist, but no init code persists them into a target repo yet. |
| `packages/testkit/src/repo-fixtures.ts` | Temporary repo helpers for init tests | ✓ VERIFIED | Creates git/non-git fixture repos with optional README/files. |
| `packages/testkit/src/provider-fixtures.ts` | Stubbed provider-home helpers for preflight tests | ✓ VERIFIED | Creates fake `~/.codex` and `~/.claude` homes for offline verification. |
| `packages/core/src/init/preflight.ts` | Structured init preflight service | ✓ VERIFIED | Produces a full preflight result without repo mutation. |
| `packages/core/src/init/scaffold.ts` | Idempotent `.agent-badge` scaffolding flow | ✓ VERIFIED | Schema-backed scaffold writer and reconciler are implemented; missing repo-local runtime integration keeps the phase short of its full goal. |
| `packages/agent-badge/src/commands/init.ts` | Runtime CLI init command wiring | ✓ VERIFIED | Orchestrates preflight and scaffold through shared core services; missing git bootstrap and runtime wiring side effects. |
| `packages/create-agent-badge/src/index.ts` | Initializer entrypoint that reuses runtime init flow | ✓ VERIFIED | Delegates directly to `runInitCommand({ cwd: process.cwd() })`. |
| `packages/core/src/init/scaffold.test.ts` | Idempotency and scaffold coverage | ✓ VERIFIED | Covers first-run create, re-run reuse, and incomplete-file reconciliation. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `package.json` | `packages/*` | npm workspace configuration | ✓ WIRED | `workspaces: ["packages/*"]` is present. |
| `packages/agent-badge/package.json` | `packages/agent-badge/src/cli/main.ts` | bin entry and compiled CLI target | ✓ WIRED | Inference from `"bin": { "agent-badge": "./dist/cli/main.js" }` plus `packages/agent-badge/tsconfig.json` `rootDir: "src"` and `outDir: "dist"`. |
| `vitest.config.ts` | `packages/**/*.test.ts` | workspace test include globs | ✓ WIRED | `test.include` contains `packages/**/*.test.ts`. |
| `packages/core/src/runtime/local-cli.ts` | `packages/core/src/runtime/package-manager.ts` | package-manager-specific command generation | ✓ WIRED | `local-cli.ts` imports `packageManagerSchema` and `PackageManager` from `package-manager.ts`. |
| `packages/core/src/index.ts` | `packages/core/src/config/config-schema.ts` | re-export surface for later init commands | ✓ WIRED | `packages/core/src/index.ts` re-exports `./config/index.js`, and that module re-exports `config-schema.js`. |
| `packages/testkit/src/index.ts` | `packages/testkit/src/repo-fixtures.ts` | shared fixture exports | ✓ WIRED | `packages/testkit/src/index.ts` re-exports `createRepoFixture`. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/init/preflight.ts` | runtime init command invoking shared preflight | ✓ WIRED | `runInitCommand` imports and calls `runInitPreflight`. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/init/scaffold.ts` | runtime init command invoking shared scaffold | ✓ WIRED | `runInitCommand` imports and calls `applyAgentBadgeScaffold`. |
| `packages/create-agent-badge/src/index.ts` | `packages/agent-badge/src/commands/init.ts` | initializer reusing runtime init orchestration | ✓ WIRED | `runCreateAgentBadge` delegates to `runInitCommand`. |
| `packages/core/src/init/scaffold.ts` | `packages/core/src/config/config-schema.ts` | schema-backed config writing | ✓ WIRED | `scaffold.ts` calls `createDefaultAgentBadgeConfig`, which parses through the config schema. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/core/src/init/preflight.ts` | `git`, `readme`, `packageManager`, `providers`, `githubAuth`, `existingScaffold` | `git` subprocesses, filesystem reads, lockfile detection, provider-home existence checks, env/checker auth detection | Yes | ✓ FLOWING |
| `packages/core/src/init/scaffold.ts` | `config.json` and `state.json` contents | Existing JSON on disk plus schema default factories derived from preflight provider availability and current time | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/init.ts` | Printed preflight/scaffold summary and returned result | Shared core service outputs from `runInitPreflight` and `applyAgentBadgeScaffold` | Yes | ✓ FLOWING |
| `packages/create-agent-badge/src/index.ts` | Delegated init options | `runInitCommand({ ...options, cwd: process.cwd() })` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Shared workspace typecheck | `npm run typecheck` | Exit 0 | ✓ PASS |
| Workspace test harness | `npm test -- --run` | 7 test files passed, 20 tests passed | ✓ PASS |
| Non-git init bootstrap path | `TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx -e "...runInitCommand({ allowGitInit: true })..."` | `{"gitExists":false,"scaffoldExists":true,"configExists":true}` | ✗ FAIL |
| Runtime wiring after init | `TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx -e "...runInitCommand() in a temp git repo..."` | `{"packageJsonChanged":false,"prePushHookExists":false,"agentBadgeDirExists":true,"configExists":true,"stateExists":true}` | ✗ FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `BOOT-01` | `01-01`, `01-03` | Developer can initialize an existing repository through `npm init agent-badge@latest` without requiring a global install. | ✓ SATISFIED | `packages/create-agent-badge/package.json` exposes the expected initializer package/bin, and `packages/create-agent-badge/src/index.ts` delegates to the shared init flow. |
| `BOOT-02` | `01-03` | Developer can initialize a non-git directory by letting the tool create git or by receiving a precise blocking message with the next action. | ✗ BLOCKED | The blocking path exists when `allowGitInit` is false, but the allowed path does not bootstrap git; the temp-dir probe left `.git` absent after init. |
| `BOOT-03` | `01-02`, `01-03` | Init installs or wires a repo-local runtime so package scripts and git hooks can invoke `agent-badge` after normal dependency install. | ✗ BLOCKED | `packages/core/src/runtime/local-cli.ts` only builds command strings, and the init path never writes package scripts, dependencies, or git hooks into the target repo. |
| `BOOT-04` | `01-02`, `01-03` | Init creates `.agent-badge/config.json`, `.agent-badge/state.json`, `.agent-badge/cache/`, and `.agent-badge/logs/`. | ✓ SATISFIED | `packages/core/src/init/scaffold.ts` creates all four artifacts, and `packages/core/src/init/scaffold.test.ts` verifies first-run creation and re-run reuse. |

Phase 1 requirement IDs declared in plan frontmatter: `BOOT-01`, `BOOT-02`, `BOOT-03`, `BOOT-04`.

Cross-reference against `.planning/REQUIREMENTS.md`: all four IDs are accounted for, and no additional Phase 1 requirement IDs were orphaned from the phase plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `-` | `-` | No TODO/placeholder or empty-return stubs were found in non-test phase files. | ℹ️ Info | Remaining failures are missing orchestration behaviors, not placeholder text or hollow render logic. |

### Human Verification Required

None identified while the automated blockers above remain unresolved.

### Gaps Summary

Most plan-level artifacts are real, substantive, and wired: the workspace exists, the schemas are strict, the preflight is genuinely non-mutating, the scaffold is schema-backed, and idempotent re-entry is covered by tests. The phase still fails goal-backward verification because two requirement-level outcomes are missing from the actual init path.

First, the non-git bootstrap path is hollow. `getGitContext()` reports that init may proceed when `allowGitInit` is true, but `runInitCommand()` never turns that permission into a `git init`, so init mutates a non-git directory without satisfying `BOOT-02`. Second, the repo-local runtime wiring is only modeled, not applied: command builders exist, but init does not modify a target repo's package scripts, dependencies, or hooks, so `BOOT-03` is not achieved. Those two gaps block the phase goal even though the scaffold and supporting infrastructure are otherwise sound.

---

_Verified: 2026-03-30T06:51:24Z_
_Verifier: Claude (gsd-verifier)_
