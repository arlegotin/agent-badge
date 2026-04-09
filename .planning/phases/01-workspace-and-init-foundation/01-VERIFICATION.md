---
phase: 01-workspace-and-init-foundation
verified: 2026-03-30T10:06:50Z
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Init can safely handle non-git directories by either bootstrapping git or blocking with a precise next action."
    - "Init creates repo-local runtime wiring so package scripts or git hooks can invoke `agent-badge` after dependency install."
  gaps_remaining: []
  regressions: []
---

# Phase 1: Workspace and Init Foundation Verification Report

**Phase Goal:** Deliver the repository structure, local runtime wiring, and init preflight/scaffolding needed for every later feature.
**Verified:** 2026-03-30T10:06:50Z
**Status:** passed
**Re-verification:** Yes — after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Maintainer can run both workspace packages locally with one shared build/test setup. | ✓ VERIFIED | `package.json:5-20` defines shared workspace scripts and `npm run typecheck` plus `npm test -- --run` both passed. |
| 2 | `agent-badge init` can detect git state, README presence, package manager, provider availability, and GitHub auth before mutating the repo. | ✓ VERIFIED | `packages/core/src/init/preflight.ts:43-132` assembles `git`, `readme`, `packageManager`, `providers`, `githubAuth`, and `existingScaffold`; `packages/core/src/init/preflight.test.ts:64-155` keeps this path non-mutating. |
| 3 | Init can safely handle non-git directories by either bootstrapping git or blocking with a precise next action. | ✓ VERIFIED | `packages/agent-badge/src/commands/init.ts:184-221` now blocks cleanly or calls `initializeGitRepository()` from `packages/core/src/repo/git-context.ts:101-108`, reruns preflight, and stops before scaffold if bootstrap fails. Direct temp-repo probes returned `gitExists:true`, `preflightIsRepo:true` for the allowed path and `gitExists:false`, `scaffoldExists:false` with the blocking message for the disallowed path. |
| 4 | Init creates the `.agent-badge` scaffold and repo-local runtime wiring without requiring a global install. | ✓ VERIFIED | `packages/core/src/init/scaffold.ts:364-397` creates the scaffold, and `packages/core/src/init/runtime-wiring.ts:173-271` writes `package.json` scripts, `devDependencies.agent-badge`, and `.git/hooks/pre-push`. Direct temp-repo probes produced `packageJsonExists:true`, `prePushHookExists:true`, and a managed hook block invoking `npm run --silent agent-badge:refresh || true`. |
| 5 | Re-running init converges without duplicate scaffold output or silent overwrite of valid existing state. | ✓ VERIFIED | `packages/core/src/init/scaffold.test.ts:125-240` proves scaffold reuse and value preservation; `packages/core/src/init/runtime-wiring.test.ts:114-193` plus a direct rerun probe show exactly one managed hook block and reused runtime wiring on the second run. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `package.json` | Root workspace configuration and shared scripts | ✓ VERIFIED | Substantive workspace root with `workspaces`, `build`, `test`, `typecheck`, and local dev scripts. |
| `packages/core/src/init/preflight.ts` | Structured init preflight service | ✓ VERIFIED | Reads repo facts and provider/auth state without mutating the target repo. |
| `packages/core/src/repo/git-context.ts` | Shared git bootstrap helper used by init | ✓ VERIFIED | `getGitContext()` stays read-only and `initializeGitRepository()` performs `git init --quiet` when allowed. |
| `packages/core/src/init/scaffold.ts` | Idempotent `.agent-badge` scaffolding flow | ✓ VERIFIED | Creates `.agent-badge/config.json`, `.agent-badge/state.json`, `.agent-badge/cache/`, and `.agent-badge/logs/`, then reconciles reruns safely. |
| `packages/core/src/init/runtime-wiring.ts` | Repo-local runtime dependency, script, and hook wiring | ✓ VERIFIED | Writes managed `package.json` wiring and one marker-delimited `pre-push` hook block. |
| `packages/agent-badge/src/commands/init.ts` | Runtime CLI init orchestration | ✓ VERIFIED | Runs preflight, bootstraps git when needed, scaffolds, applies runtime wiring, and returns all three result sections. |
| `packages/create-agent-badge/src/index.ts` | Initializer entrypoint that reuses runtime init flow | ✓ VERIFIED | Delegates directly to `runInitCommand({ cwd: process.cwd() })`. |
| `packages/core/src/init/runtime-wiring.test.ts` | First-run hook and rerun convergence coverage | ✓ VERIFIED | Confirms runnable hook creation, preserved unrelated content, executable mode, and no duplicate markers. |
| `packages/agent-badge/src/commands/init.test.ts` | End-to-end init coverage for allowed, blocked, and rerun paths | ✓ VERIFIED | Covers shared init flow, non-git bootstrap, blocked non-git path, and runtime-wiring idempotency. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `package.json` | `packages/*` | npm workspace configuration | ✓ WIRED | `workspaces: ["packages/*"]` is present. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/init/preflight.ts` | runtime init command invoking shared preflight | ✓ WIRED | `runInitCommand()` calls `runInitPreflight()` before any mutations. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/repo/git-context.ts` | shared git bootstrap helper invoked before scaffold | ✓ WIRED | `runInitCommand()` calls `initializeGitRepository()` when preflight says init is allowed but repo is absent. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/init/scaffold.ts` | runtime init command invoking shared scaffold | ✓ WIRED | `runInitCommand()` calls `applyAgentBadgeScaffold()` after git state is valid. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/init/runtime-wiring.ts` | init invoking repo-local runtime integration after scaffold | ✓ WIRED | `runInitCommand()` calls `applyRepoLocalRuntimeWiring()` and returns its result. |
| `packages/core/src/init/runtime-wiring.ts` | `packages/core/src/runtime/local-cli.ts` | package-manager-specific script and hook command generation | ✓ WIRED | Runtime wiring imports managed script names and `getPrePushRefreshCommand()`. |
| `packages/core/src/init/runtime-wiring.ts` | target repo `package.json` | idempotent JSON merge for dependency and scripts | ✓ WIRED | Adds `devDependencies.agent-badge`, `scripts.agent-badge:init`, and `scripts.agent-badge:refresh` while preserving unrelated fields. |
| `packages/core/src/init/runtime-wiring.ts` | target repo `.git/hooks/pre-push` | one managed agent-owned block with shell preamble and executable mode | ✓ WIRED | Creates or updates a marker-delimited hook block and ensures executable permissions. |
| `packages/create-agent-badge/src/index.ts` | `packages/agent-badge/src/commands/init.ts` | initializer reusing runtime init orchestration | ✓ WIRED | `runCreateAgentBadge()` delegates to `runInitCommand()`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/core/src/init/preflight.ts` | `git`, `readme`, `packageManager`, `providers`, `githubAuth`, `existingScaffold` | git subprocesses, README directory scan, lockfile detection, provider-home existence checks, env/checker auth detection | Yes | ✓ FLOWING |
| `packages/core/src/init/scaffold.ts` | `.agent-badge/config.json` and `.agent-badge/state.json` contents | schema default factories plus existing on-disk JSON reconciliation | Yes | ✓ FLOWING |
| `packages/core/src/init/runtime-wiring.ts` | target `package.json` fields and `.git/hooks/pre-push` content | managed script builders from `local-cli.ts`, detected package manager, and runtime dependency specifier | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/init.ts` | returned `preflight`, `scaffold`, and `runtimeWiring` results | shared core services plus runtime package manifest version normalization | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Shared workspace typecheck | `npm run typecheck` | Exit `0` | ✓ PASS |
| Shared test harness | `npm test -- --run` | `8` test files passed, `25` tests passed | ✓ PASS |
| Allowed non-git init bootstraps git before scaffold and wiring | `node --import tsx temp probe with runInitCommand({ allowGitInit: true })` | `gitExists:true`, `scaffoldExists:true`, `packageJsonExists:true`, `prePushHookExists:true`, `preflightIsRepo:true` | ✓ PASS |
| Disallowed non-git init blocks without mutation | `node --import tsx temp probe with runInitCommand({ allowGitInit: false })` | Blocking message returned; `gitExists:false`, `scaffoldExists:false` | ✓ PASS |
| Rerun convergence for runtime wiring | `node --import tsx temp probe running init twice` | Second run reported only `reused`; hook marker counts stayed `1/1` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `BOOT-01` | `01-01`, `01-03`, `01-04`, `01-05` | Developer can initialize an existing repository through `npm init agent-badge@latest` without requiring a global install. | ✓ SATISFIED | `packages/create-agent-badge/package.json` exposes the initializer package/bin, and `packages/create-agent-badge/src/index.ts:12-24` delegates to the shared repo-local init flow. |
| `BOOT-02` | `01-03`, `01-04`, `01-05` | Developer can initialize a non-git directory by letting the tool create git or by receiving a precise blocking message with the next action. | ✓ SATISFIED | `packages/core/src/repo/git-context.ts:57-109` and `packages/agent-badge/src/commands/init.ts:184-221` implement both paths; direct probes and `packages/agent-badge/src/commands/init.test.ts:217-273` verify them. |
| `BOOT-03` | `01-02`, `01-03`, `01-04`, `01-05` | Init installs or wires a repo-local runtime so package scripts and git hooks can invoke `agent-badge` after normal dependency install. | ✓ SATISFIED | `packages/core/src/init/runtime-wiring.ts:173-271` persists repo-local dependency/scripts/hook wiring, and `packages/agent-badge/src/commands/init.ts:233-239` invokes it. Direct probes and `packages/core/src/init/runtime-wiring.test.ts:53-193` confirm runnable first-run hook behavior and idempotent reruns. |
| `BOOT-04` | `01-02`, `01-03`, `01-04`, `01-05` | Init creates `.agent-badge/config.json`, `.agent-badge/state.json`, `.agent-badge/cache/`, and `.agent-badge/logs/`. | ✓ SATISFIED | `packages/core/src/init/scaffold.ts:364-397` creates all four artifacts, and `packages/core/src/init/scaffold.test.ts:78-123` verifies first-run creation. |

Phase 1 requirement IDs declared in plan frontmatter: `BOOT-01`, `BOOT-02`, `BOOT-03`, `BOOT-04`.

Cross-reference against `.planning/REQUIREMENTS.md`: all four declared IDs are accounted for, and no additional Phase 1 requirement IDs are orphaned from the phase plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `-` | `-` | No blocker TODO/placeholder or hollow implementation patterns were found in Phase 1 product code. Grep hits were limited to benign helper/test text. | ℹ️ Info | No anti-pattern blocks phase closure. |

### Human Verification Required

None. The phase goal is CLI and filesystem behavior, and the critical paths were verified programmatically with temp repositories.

### Gaps Summary

None. The previous BOOT-02 and BOOT-03 gaps are closed in the codebase:

- Allowed non-git init now creates `.git/` before scaffold writes and returns a refreshed preflight object with `git.isRepo === true`.
- Init now writes repo-local `package.json` scripts, `devDependencies.agent-badge`, and one managed failure-soft `.git/hooks/pre-push` block without relying on a global install.
- Rerunning init converges across both scaffold and runtime wiring, preserving existing valid state and avoiding duplicate hook markers or script/dependency entries.

---

_Verified: 2026-03-30T10:06:50Z_
_Verifier: Claude (gsd-verifier)_
