# Phase 25: Global Runtime Contract And Command Resolution - Research

**Researched:** 2026-04-08 [VERIFIED: environment context]  
**Domain:** Shared CLI runtime discovery, package-manager-neutral command generation, and managed hook invocation. [VERIFIED: .planning/ROADMAP.md]  
**Confidence:** MEDIUM. [ASSUMED]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| DIST-01 | Developer can install `agent-badge` once at global or user scope and reuse that CLI across repositories without adding `@legotin/agent-badge` to each repo's dependencies. [VERIFIED: .planning/REQUIREMENTS.md] | Use one shared `agent-badge` executable contract resolved from the machine environment, not from repo manifests, lockfiles, or `node_modules/.bin`. [VERIFIED: .planning/REQUIREMENTS.md][VERIFIED: codebase grep][CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/][CITED: https://pnpm.io/cli/bin][CITED: https://bun.sh/docs/pm/cli/add] |
| DIST-03 | Init and normal commands explain how to satisfy the shared CLI prerequisite when a usable global or user-scoped runtime cannot be resolved. [VERIFIED: .planning/REQUIREMENTS.md] | Add one typed runtime-availability probe plus one shared remediation renderer consumed by `init`, `config`, `doctor`, `status`, `refresh`, and generated hooks. [VERIFIED: codebase grep][CITED: https://nodejs.org/api/child_process.html] |
| AUTO-01 | Managed refresh and other generated repo entrypoints invoke `agent-badge` without relying on repo-local binaries, `npx --no-install`, or package-manager script wiring that exists only to reach a local runtime. [VERIFIED: .planning/REQUIREMENTS.md] | Replace package-manager-specific wrapper builders with one package-manager-neutral managed command and hook block that calls `agent-badge refresh ...` directly. [VERIFIED: .planning/ROADMAP.md][VERIFIED: codebase grep] |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- Collection remains local-first and serverless because the source data lives on the developer machine. [VERIFIED: AGENTS.md]
- No raw transcripts, prompt text, filenames, or local paths may leave the machine; Phase 25 remediation and diagnostics must preserve that privacy boundary. [VERIFIED: AGENTS.md]
- Setup must still feel initializer-first from `npm init agent-badge@latest`; Phase 25 should define the contract Phase 26 will consume, not break the one-command onboarding story. [VERIFIED: AGENTS.md][VERIFIED: .planning/ROADMAP.md]
- README badge URLs must remain stable after first insertion, so runtime-contract work must not disturb publish-target or README-marker semantics. [VERIFIED: AGENTS.md]
- Incremental refresh must remain fast enough for `pre-push` and default failure-soft behavior must remain intact. [VERIFIED: AGENTS.md]
- `init` must remain idempotent, so new runtime wiring must still converge on one managed hook block and one badge block across reruns. [VERIFIED: AGENTS.md][VERIFIED: codebase grep]

## Summary

The current codebase is still built around a repo-local runtime model. `packages/core/src/runtime/local-cli.ts` hard-codes `npx --no-install`, `pnpm exec`, `yarn`, and `bunx` command tables, `packages/core/src/init/runtime-wiring.ts` writes repo-owned package scripts plus hook blocks that call those scripts, `packages/create-agent-badge/src/index.ts` installs `@legotin/agent-badge` into the target repo after init, and the smoke/docs surfaces still assert repo-local binaries and `npx --no-install` usage. [VERIFIED: codebase grep]

Official package-manager docs all describe the shared-runtime model as "install the CLI globally or at user scope and make its bin directory available on `PATH`". Node's child-process APIs already support probing a fixed executable name with inherited environment variables, report `ENOENT` when the command is missing, and default to `shell: false`. Inference: Phase 25 should standardize on one package-manager-neutral `agent-badge` executable contract, not a new wrapper matrix. [CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/][CITED: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/][CITED: https://pnpm.io/cli/add][CITED: https://pnpm.io/cli/bin][CITED: https://pnpm.io/cli/setup][CITED: https://bun.sh/docs/pm/cli/add][CITED: https://classic.yarnpkg.com/lang/en/docs/cli/global/][CITED: https://nodejs.org/api/child_process.html]

Phase 25 should stop at the contract boundary. It should add shared runtime probing, shared remediation, and package-manager-neutral command generation, then rewire hook/doctor/config/init/uninstall to consume that contract. It should not also remove repo-local artifact creation from initializer flows in the same phase, because that work is explicitly assigned to Phase 26. [VERIFIED: .planning/ROADMAP.md][VERIFIED: .planning/REQUIREMENTS.md]

**Primary recommendation:** Use a single PATH-based `agent-badge` command contract for all runtime writers and readers, probe availability in core with `spawnSync` or `execFile` using `shell: false`, and make every caller reuse one remediation builder that explains how to install the shared runtime or fix `PATH`. [CITED: https://nodejs.org/api/child_process.html][CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/][CITED: https://pnpm.io/cli/bin][CITED: https://bun.sh/docs/pm/cli/add]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| Node.js built-ins (`node:child_process`, `node:fs`, `node:path`) | Repo engines are `^20 || ^22 || ^24`, and this machine is on Node `22.14.0`. [VERIFIED: package.json][VERIFIED: local environment probe] | Probe the shared runtime, write managed hook blocks, and keep execution shell-free in core code. [CITED: https://nodejs.org/api/child_process.html] | No extra dependency is required to detect a missing executable or run a fixed command safely. [CITED: https://nodejs.org/api/child_process.html] |
| TypeScript | Repo range `^5.0.0`. [VERIFIED: package.json] | Encode one typed runtime contract result consumed by init/config/doctor/uninstall/hook writers. [VERIFIED: codebase grep] | The repo is already TypeScript-first; Phase 25 is wiring and contract work, not a language migration. [VERIFIED: package.json][VERIFIED: codebase grep] |
| `zod` | Repo range `^4.0.0`; current npm version `4.3.6`, modified `2026-01-25T21:51:57.252Z`. [VERIFIED: packages/core/package.json][VERIFIED: npm registry] | Keep runtime-contract inputs and outputs typed the same way config/state parsing is already typed. [VERIFIED: packages/core/package.json] | Reusing the repo's existing validation library is lower-risk than introducing another schema tool. [VERIFIED: packages/core/package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `vitest` | Repo range `^3.2.0`; installed `3.2.4`; latest npm version `4.1.3`, modified `2026-04-07T09:55:51.541Z`. [VERIFIED: package.json][VERIFIED: local environment probe][VERIFIED: npm registry] | Cover the shared runtime probe, hook generation, diagnostics, and cross-package-manager fixture matrix. [VERIFIED: codebase grep] | Keep the existing suite for Phase 25; an upgrade to Vitest 4 is not required to satisfy this phase. [VERIFIED: codebase grep][ASSUMED] |
| Git hook mechanism | Git `2.49.0` is installed locally, and Git runs non-bare hooks from the work-tree root. [VERIFIED: local environment probe][CITED: https://git-scm.com/docs/githooks] | Continue to generate `.git/hooks/pre-push` as the managed automation entrypoint. [VERIFIED: codebase grep] | Use when validating idempotent reruns and policy-aware fail-soft/strict hook behavior. [VERIFIED: AGENTS.md][VERIFIED: codebase grep] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| A PATH-based `agent-badge` contract with one shared probe. [CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/][CITED: https://pnpm.io/cli/bin] | Persist an absolute resolved executable path in the hook or config. [ASSUMED] | This may reduce PATH sensitivity in some environments, but it introduces stale-path risk after global upgrades or runtime relocation. [ASSUMED] |
| `spawnSync` / `execFile` with fixed args and `shell: false`. [CITED: https://nodejs.org/api/child_process.html] | Shell out to `command -v`, `which`, or package-manager exec wrappers from core code. [VERIFIED: codebase grep] | Shell probing is less portable in Node core code, and wrapper-based execution is the exact behavior this phase is meant to retire. [CITED: https://nodejs.org/api/child_process.html][VERIFIED: .planning/ROADMAP.md] |

**Installation guidance for the shared runtime contract:** [CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/][CITED: https://pnpm.io/cli/add][CITED: https://bun.sh/docs/pm/cli/add]

```bash
npm install -g @legotin/agent-badge
pnpm add -g @legotin/agent-badge
bun add -g @legotin/agent-badge
```

`yarn global add` is documented for Yarn Classic only, and this machine has Yarn `1.22.22`; keep Yarn-global remediation optional unless the planner explicitly wants to support Classic-specific install guidance in operator messaging. [CITED: https://classic.yarnpkg.com/lang/en/docs/cli/global/][VERIFIED: local environment probe][ASSUMED]

**Version verification commands used during research:** `npm view zod version time.modified`, `npm view vitest version time.modified`, `npm view commander version time.modified`, `npm view octokit version time.modified`, `npm view tsx version time.modified`. [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure

Inference: add one new shared-runtime module in core and keep command-layer edits thin. [VERIFIED: codebase grep][ASSUMED]

```text
packages/core/src/runtime/
├── package-manager.ts      # keep only repo-context detection that still matters elsewhere [VERIFIED: codebase grep][ASSUMED]
├── shared-cli.ts           # new typed runtime probe, command builder, and remediation renderer [ASSUMED]
└── shared-cli.test.ts      # new availability/missing-runtime/messaging matrix [ASSUMED]

packages/core/src/init/
└── runtime-wiring.ts       # writer becomes package-manager-neutral for shared hooks [VERIFIED: codebase grep][ASSUMED]

packages/core/src/diagnostics/
└── doctor.ts               # reader accepts legacy + shared contracts during migration window [VERIFIED: codebase grep][ASSUMED]
```

### Pattern 1: Typed Shared Runtime Probe
**What:** Add one `inspectSharedRuntime()` or similarly named core helper that probes `agent-badge --version` with fixed args, inherited env, and `shell: false`, then returns a typed result such as `available`, `missing`, or `broken`. [CITED: https://nodejs.org/api/child_process.html][ASSUMED]

**When to use:** `init`, `config`, `doctor`, `status`, `refresh`, `uninstall`, and hook writers should all consume the same result instead of duplicating command lookup or remediation copy. [VERIFIED: codebase grep][ASSUMED]

**Example:**
```typescript
// Source: https://nodejs.org/api/child_process.html
import { spawnSync } from "node:child_process";

const result = spawnSync("agent-badge", ["--version"], {
  encoding: "utf8",
  env: process.env,
  shell: false,
  stdio: "pipe",
  windowsHide: true
});

if (result.error && "code" in result.error && result.error.code === "ENOENT") {
  return { status: "missing" as const };
}

if (result.status !== 0) {
  return { status: "broken" as const, detail: result.stderr.trim() };
}

return { status: "available" as const, version: result.stdout.trim() };
```

### Pattern 2: Single Writer, Dual Reader
**What:** Writers should emit only the new shared-runtime hook contract, but readers such as `doctor` and `uninstall` should continue recognizing both the legacy `agent-badge:refresh` script contract and the new direct `agent-badge refresh ...` contract until Phase 27 finishes migration. [VERIFIED: codebase grep][VERIFIED: .planning/ROADMAP.md][ASSUMED]

**When to use:** Apply this pattern anywhere Phase 25 rewires existing repos without yet performing the full migration/removal work scheduled for Phase 27. [VERIFIED: .planning/ROADMAP.md][ASSUMED]

**Example:**
```typescript
// Source: existing project pattern in packages/core/src/diagnostics/doctor.ts
const invokesRefresh =
  managedContent.includes("agent-badge refresh --hook pre-push") ||
  managedContent.includes("agent-badge:refresh");
```

### Pattern 3: Package-Manager-Neutral Hook Block
**What:** The managed hook should branch only on policy (`fail-soft` vs `strict`) and runtime availability, not on repo package manager. [VERIFIED: .planning/ROADMAP.md][VERIFIED: codebase grep]

**When to use:** Replace `getPrePushRefreshCommand(packageManager)` and the package-script indirection in runtime wiring. [VERIFIED: codebase grep]

**Example:**
```sh
# Source: https://git-scm.com/docs/githooks and global-install docs cited in Standard Stack
if ! command -v agent-badge >/dev/null 2>&1; then
  echo "agent-badge runtime not found. Install it once with npm install -g @legotin/agent-badge, pnpm add -g @legotin/agent-badge, or bun add -g @legotin/agent-badge."
  exit 0
fi

agent-badge refresh --hook pre-push --hook-policy fail-soft || true
```

### Anti-Patterns to Avoid
- **Do not keep the wrapper table as the runtime contract:** `npx --no-install`, `pnpm exec`, `yarn run`, `bun run`, and `node_modules/.bin` are the exact assumptions Phase 25 is supposed to remove. [VERIFIED: .planning/ROADMAP.md][VERIFIED: codebase grep]
- **Do not fold Phase 26 into this phase:** removing repo-local package installation, manifest mutation, and lockfile churn belongs to the next phase. [VERIFIED: .planning/ROADMAP.md][VERIFIED: .planning/REQUIREMENTS.md]
- **Do not scatter remediation strings across commands:** one missing-runtime message should be rendered from one core helper so operator guidance cannot drift. [VERIFIED: codebase grep][ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Runtime command selection | Another package-manager-specific wrapper matrix. [VERIFIED: codebase grep] | One direct `agent-badge` command contract plus one shared runtime probe. [VERIFIED: .planning/ROADMAP.md][CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/][CITED: https://pnpm.io/cli/bin] | The current matrix is already the behavior this milestone is replacing. [VERIFIED: codebase grep][VERIFIED: .planning/ROADMAP.md] |
| Executable probing in core code | `sh -c 'command -v agent-badge'`, `which`, or other shell-string probes from Node. [ASSUMED] | `spawnSync` or `execFile` with fixed args and `shell: false`. [CITED: https://nodejs.org/api/child_process.html] | Node already provides `ENOENT` signaling and safe argument handling without a shell. [CITED: https://nodejs.org/api/child_process.html] |
| Caller-specific remediation | Separate install/PATH guidance in `init`, `config`, `doctor`, `status`, and the hook writer. [VERIFIED: codebase grep][ASSUMED] | One shared remediation builder in core. [ASSUMED] | Centralizing wording is the only reliable way to keep DIST-03 consistent across commands and automation. [VERIFIED: .planning/REQUIREMENTS.md][ASSUMED] |

**Key insight:** The difficult part of Phase 25 is not "finding a command"; it is defining one canonical command contract that writers emit, readers validate, and remediation surfaces explain the same way everywhere. [VERIFIED: codebase grep][VERIFIED: .planning/REQUIREMENTS.md][ASSUMED]

## Common Pitfalls

### Pitfall 1: Accidentally Doing Phase 26 Work Inside Phase 25
**What goes wrong:** The plan starts deleting repo-local install artifacts and initializer package-manifest mutations while it is still trying to establish the shared-runtime contract. [VERIFIED: codebase grep][VERIFIED: .planning/ROADMAP.md]
**Why it happens:** The current initializer and runtime wiring are tightly coupled through repo-local install steps. [VERIFIED: codebase grep]
**How to avoid:** Land the shared probe, shared remediation, shared hook writer, and dual-read diagnostics first; leave artifact-minimization and initializer-flow changes to Phase 26. [VERIFIED: .planning/ROADMAP.md][ASSUMED]
**Warning signs:** The Phase 25 plan starts asserting lockfile absence, dropping `package.json` edits from init end-to-end, or rewriting `create-agent-badge` installation flow completely. [VERIFIED: .planning/ROADMAP.md][ASSUMED]

### Pitfall 2: Keeping Package Manager Detection in the Critical Path
**What goes wrong:** Hooks and generated commands still vary across npm/pnpm/yarn/bun repos, which preserves the exact repo-local assumptions the milestone is removing. [VERIFIED: codebase grep][VERIFIED: .planning/ROADMAP.md]
**Why it happens:** `detectPackageManager()` currently feeds the runtime-wiring path, so it is easy to keep threading that value forward. [VERIFIED: codebase grep]
**How to avoid:** Treat package manager as repo context only; the shared runtime contract should be invariant across lockfile types. [VERIFIED: codebase grep][ASSUMED]
**Warning signs:** New tests still assert `npm run --silent agent-badge:refresh`, `pnpm run`, `yarn run`, or `bun run` in the managed hook output. [VERIFIED: codebase grep]

### Pitfall 3: Missing-Runtime Handling Only Works in Interactive Shells
**What goes wrong:** `init` or `config` succeeds in the current shell, but pre-push fails later because the hook environment cannot resolve the runtime. [ASSUMED]
**Why it happens:** Global-install docs rely on the user having the correct global bin directory on `PATH`, and hooks run in Git's execution environment, not in the planner's test imagination. [CITED: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/][CITED: https://pnpm.io/cli/setup][CITED: https://classic.yarnpkg.com/lang/en/docs/cli/global/][CITED: https://git-scm.com/docs/githooks][ASSUMED]
**How to avoid:** Check runtime availability before writing shared hooks, print explicit PATH/global-install remediation in the hook body, and keep the result policy-aware for fail-soft vs strict. [CITED: https://nodejs.org/api/child_process.html][ASSUMED]
**Warning signs:** `ENOENT` from the shared probe or a hook error that says `agent-badge` is not found. [CITED: https://nodejs.org/api/child_process.html][ASSUMED]

### Pitfall 4: Privacy Regressions in Diagnostics
**What goes wrong:** Runtime remediation starts printing local install paths or shell-specific directory details into operator output that may be pasted into issues or logs. [VERIFIED: AGENTS.md][ASSUMED]
**Why it happens:** The easiest debug output is often the raw resolved path or raw home-directory value. [ASSUMED]
**How to avoid:** Keep remediation generic and action-oriented, and do not require resolved local paths for the baseline contract. [VERIFIED: AGENTS.md][ASSUMED]
**Warning signs:** Planned output examples include full home-directory paths, package-cache paths, or local install roots. [VERIFIED: AGENTS.md][ASSUMED]

## Code Examples

Verified patterns from official sources:

### Shared Runtime Probe
```typescript
// Source: https://nodejs.org/api/child_process.html
import { spawnSync } from "node:child_process";

export function runtimeAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  const result = spawnSync("agent-badge", ["--version"], {
    encoding: "utf8",
    env,
    shell: false,
    stdio: "pipe",
    windowsHide: true
  });

  return !result.error && result.status === 0;
}
```

### Managed Hook Body
```sh
# Source: https://git-scm.com/docs/githooks
if ! command -v agent-badge >/dev/null 2>&1; then
  echo "agent-badge runtime not found. Install it once and ensure its global bin directory is on PATH."
  exit 0
fi

agent-badge refresh --hook pre-push --hook-policy fail-soft || true
```

### Legacy + Shared Contract Detection
```typescript
// Source: existing project pattern in packages/core/src/diagnostics/doctor.ts
const invokesRefresh =
  managedContent.includes("agent-badge refresh --hook pre-push") ||
  managedContent.includes("agent-badge:refresh");
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Repo-local runtime wiring through `npx --no-install`, `pnpm exec`, repo package scripts, and `node_modules/.bin`. [VERIFIED: codebase grep] | Shared/global CLI installed once and discovered from the machine environment through global bin directories on `PATH`. [CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/][CITED: https://pnpm.io/cli/bin][CITED: https://bun.sh/docs/pm/cli/add][CITED: https://classic.yarnpkg.com/lang/en/docs/cli/global/] | The project committed to this contract in milestone v2.0 on 2026-04-08. [VERIFIED: .planning/ROADMAP.md][VERIFIED: .planning/STATE.md] | Hooks and generated commands can become package-manager-neutral, and target repos can stop depending on repo-local runtime install in later phases. [VERIFIED: .planning/REQUIREMENTS.md][VERIFIED: .planning/ROADMAP.md] |

**Deprecated/outdated for this milestone:**
- Generated use of `npx --no-install`, `pnpm exec`, `yarn run agent-badge:refresh`, `bun run agent-badge:refresh`, and repo-owned `agent-badge:init` / `agent-badge:refresh` scripts as the canonical runtime contract. [VERIFIED: .planning/ROADMAP.md][VERIFIED: codebase grep]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | A plain PATH-based `agent-badge` contract is sufficient for managed hooks on supported developer environments, without persisting an absolute executable path. [ASSUMED] | Summary, Architecture Patterns, Open Questions | Hooks may fail in GUI or other restricted-PATH environments and require a follow-up fallback design. |
| A2 | The repo can keep Vitest on the current `3.2.x` line for Phase 25 without needing an immediate runner upgrade. [ASSUMED] | Standard Stack, Validation Architecture | The plan may under-budget test-runner migration work if a missing capability is discovered. |
| A3 | Yarn-global remediation should stay optional unless the product explicitly commits to Yarn Classic install guidance. [ASSUMED] | Standard Stack, Open Questions | Operator messaging may be incomplete for Yarn-first users if Classic support is expected. |

## Open Questions

1. **Should managed hooks persist plain `agent-badge` or a resolved absolute executable path?**
   What we know: official npm, pnpm, bun, and Yarn Classic docs all define global command use through a bin directory that must be on `PATH`, and Git runs non-bare hooks from the work-tree root. [CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/][CITED: https://pnpm.io/cli/bin][CITED: https://bun.sh/docs/pm/cli/add][CITED: https://classic.yarnpkg.com/lang/en/docs/cli/global/][CITED: https://git-scm.com/docs/githooks]
   What's unclear: how often target users push from environments where `PATH` differs from the shell used for `init`. [ASSUMED]
   Recommendation: plan around plain `agent-badge` plus strong remediation first; only add absolute-path persistence if user feedback or verification data shows the PATH contract is insufficient. [ASSUMED]

2. **Should Phase 25 already make diagnostics and uninstall read both legacy and shared contracts?**
   What we know: current doctor logic already treats direct refresh commands and `agent-badge:refresh` as valid hook wiring, and Phase 27 is the explicit migration phase. [VERIFIED: codebase grep][VERIFIED: .planning/ROADMAP.md]
   What's unclear: the exact release boundary for removing legacy-reader support after migration. [ASSUMED]
   Recommendation: yes, use dual-read/single-write in Phase 25 so shared-runtime generation can land without breaking older repos before Phase 27 migration work. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | CLI execution and shared runtime probe. [VERIFIED: package.json] | ✓ [VERIFIED: local environment probe] | `22.14.0` locally; repo engines allow `20`, `22`, and `24`. [VERIFIED: local environment probe][VERIFIED: package.json] | None needed on this machine. [VERIFIED: local environment probe] |
| npm | Primary global-install remediation and registry verification. [CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/] | ✓ [VERIFIED: local environment probe] | `11.6.0`. [VERIFIED: local environment probe] | `pnpm` or `bun` global install guidance also exists. [CITED: https://pnpm.io/cli/add][CITED: https://bun.sh/docs/pm/cli/add] |
| pnpm | Optional global-install remediation and package-manager-context validation. [CITED: https://pnpm.io/cli/add] | ✓ [VERIFIED: local environment probe] | `9.15.0`. [VERIFIED: local environment probe] | If missing on another machine, lockfile-based fixture tests can still simulate pnpm repos. [ASSUMED] |
| Yarn Classic | Optional legacy-style global-install remediation and package-manager-context validation. [CITED: https://classic.yarnpkg.com/lang/en/docs/cli/global/] | ✓ [VERIFIED: local environment probe] | `1.22.22`. [VERIFIED: local environment probe] | If unsupported in planning, keep runtime guidance npm/pnpm/bun-focused and still test Yarn repos by fixture. [ASSUMED] |
| Bun | Optional global-install remediation and package-manager-context validation. [CITED: https://bun.sh/docs/pm/cli/add] | ✓ [VERIFIED: local environment probe] | `1.3.6`. [VERIFIED: local environment probe] | If missing on another machine, lockfile-based fixture tests can still simulate Bun repos. [ASSUMED] |
| Git | Hook generation, hook execution semantics, and repo fixtures. [CITED: https://git-scm.com/docs/githooks] | ✓ [VERIFIED: local environment probe] | `2.49.0`. [VERIFIED: local environment probe] | None. [VERIFIED: local environment probe] |
| Vitest | Phase validation. [VERIFIED: package.json] | ✓ [VERIFIED: local environment probe] | `3.2.4` installed. [VERIFIED: local environment probe] | Full suite can also be run through `npm test -- --run`. [VERIFIED: package.json][ASSUMED] |

**Missing dependencies with no fallback:** None on this machine. [VERIFIED: local environment probe]

**Missing dependencies with fallback:** None on this machine. [VERIFIED: local environment probe]

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | `vitest` `3.2.4` installed; repo range `^3.2.0`. [VERIFIED: local environment probe][VERIFIED: package.json] |
| Config file | `vitest.config.ts`. [VERIFIED: vitest.config.ts] |
| Quick run command | `./node_modules/.bin/vitest run packages/core/src/init/runtime-wiring.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/uninstall.test.ts packages/agent-badge/src/commands/release-readiness-matrix.test.ts`. [VERIFIED: codebase grep] |
| Full suite command | `npm test -- --run`. [VERIFIED: package.json][ASSUMED] |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| DIST-01 | Shared runtime availability is resolved without repo-local dependency or package-manager wrappers, and the managed command contract is invariant across lockfile contexts. [VERIFIED: .planning/REQUIREMENTS.md][VERIFIED: .planning/ROADMAP.md] | unit + integration [ASSUMED] | `./node_modules/.bin/vitest run packages/core/src/runtime/shared-cli.test.ts packages/core/src/init/runtime-wiring.test.ts -x` [ASSUMED] | `❌ Wave 0` for `shared-cli.test.ts`; existing `runtime-wiring.test.ts` is present but npm-centric. [VERIFIED: codebase grep] |
| DIST-03 | Missing shared runtime yields the same actionable remediation in `init`, `config`, `doctor`, and shared-hook output. [VERIFIED: .planning/REQUIREMENTS.md] | unit + integration [ASSUMED] | `./node_modules/.bin/vitest run packages/core/src/runtime/shared-cli.test.ts packages/core/src/diagnostics/doctor.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts -x` [ASSUMED] | `❌ Wave 0` for dedicated shared-runtime probe tests; existing command tests can be extended. [VERIFIED: codebase grep] |
| AUTO-01 | Managed `pre-push` invokes `agent-badge refresh --hook pre-push ...` directly, honors strict/fail-soft policy, and remains idempotent across reruns. [VERIFIED: .planning/REQUIREMENTS.md][VERIFIED: AGENTS.md] | integration [ASSUMED] | `./node_modules/.bin/vitest run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/uninstall.test.ts -x` [VERIFIED: codebase grep] | `✅` existing files, but assertions must be rewritten away from npm-script expectations. [VERIFIED: codebase grep] |

### Sampling Rate
- **Per task commit:** Run the targeted Vitest subset for the touched runtime-wiring and command files. [VERIFIED: codebase grep][ASSUMED]
- **Per wave merge:** Run `npm test -- --run`. [VERIFIED: package.json][ASSUMED]
- **Phase gate:** Full suite green plus explicit lockfile-matrix coverage for npm, pnpm, Yarn, and Bun fixtures before `/gsd-verify-work`. [VERIFIED: .planning/ROADMAP.md][ASSUMED]

### Wave 0 Gaps
- [ ] `packages/core/src/runtime/shared-cli.test.ts` - missing typed coverage for available, missing, and non-zero-exit shared-runtime probe outcomes. [ASSUMED]
- [ ] Cross-lockfile assertions in `packages/core/src/init/runtime-wiring.test.ts` or a new matrix file - current tests mostly assert npm-script output. [VERIFIED: codebase grep]
- [ ] Missing-runtime remediation assertions in `packages/core/src/diagnostics/doctor.test.ts` - current doctor tests still exercise legacy/shared hook recognition, not shared-runtime absence. [VERIFIED: codebase grep][ASSUMED]
- [ ] Lockfile-matrix scenarios in `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` - current scenario matrix is npm-only. [VERIFIED: codebase grep]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no. [VERIFIED: .planning/ROADMAP.md] | Existing GitHub-auth flows remain out of scope for this phase. [VERIFIED: .planning/ROADMAP.md] |
| V3 Session Management | no. [VERIFIED: .planning/ROADMAP.md] | No session or cookie handling changes are introduced here. [VERIFIED: .planning/ROADMAP.md] |
| V4 Access Control | no. [VERIFIED: .planning/ROADMAP.md] | This phase is local CLI/runtime wiring, not authorization logic. [VERIFIED: .planning/ROADMAP.md] |
| V5 Input Validation | yes. [VERIFIED: packages/core/package.json][VERIFIED: codebase grep] | Keep using `zod` for config/state parsing and for any new typed runtime-result surface. [VERIFIED: packages/core/package.json][ASSUMED] |
| V6 Cryptography | no. [VERIFIED: .planning/ROADMAP.md] | No new cryptographic behavior is required. [VERIFIED: .planning/ROADMAP.md] |

### Known Threat Patterns for This Stack
| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Shell or argument injection in runtime probing. [CITED: https://nodejs.org/api/child_process.html] | Tampering / Elevation [ASSUMED] | Use `spawnSync` or `execFile` with fixed arg arrays and `shell: false`. [CITED: https://nodejs.org/api/child_process.html] |
| PATH misconfiguration or command spoofing for the shared CLI. [CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/][CITED: https://pnpm.io/cli/bin][CITED: https://bun.sh/docs/pm/cli/add] | Spoofing / Tampering [ASSUMED] | Probe the runtime early, keep remediation explicit, and never fall back silently to repo-local binaries. [VERIFIED: .planning/ROADMAP.md][ASSUMED] |
| Local path leakage in operator output. [VERIFIED: AGENTS.md] | Information Disclosure [ASSUMED] | Keep remediation generic and privacy-safe; do not print local install paths unless explicitly debugging locally. [VERIFIED: AGENTS.md][ASSUMED] |

## Sources

### Primary (HIGH confidence)
- `packages/core/src/runtime/local-cli.ts` - current wrapper-table implementation and package-manager-specific command builders. [VERIFIED: codebase grep]
- `packages/core/src/init/runtime-wiring.ts` - current package script and hook generation behavior. [VERIFIED: codebase grep]
- `packages/create-agent-badge/src/index.ts` - current repo-local runtime install after init. [VERIFIED: codebase grep]
- `packages/core/src/diagnostics/doctor.ts` - current dual hook-reader logic. [VERIFIED: codebase grep]
- `packages/agent-badge/src/commands/init.ts`, `config.ts`, and `uninstall.ts` - current runtime-wiring call sites. [VERIFIED: codebase grep]
- `https://nodejs.org/api/child_process.html` - child-process execution, inherited environment, `shell: false`, and `ENOENT` behavior. [CITED: https://nodejs.org/api/child_process.html]
- `https://git-scm.com/docs/githooks` - hook working-directory behavior. [CITED: https://git-scm.com/docs/githooks]
- `https://docs.npmjs.com/downloading-and-installing-packages-globally/` - npm global install contract. [CITED: https://docs.npmjs.com/downloading-and-installing-packages-globally/]
- `https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/` - npm PATH/prefix remediation. [CITED: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/]
- `https://docs.npmjs.com/cli/v10/commands/npm-init/` - `npm init <initializer>` behavior and `npm exec` mapping. [CITED: https://docs.npmjs.com/cli/v10/commands/npm-init/]
- `https://pnpm.io/cli/add`, `https://pnpm.io/cli/bin`, `https://pnpm.io/cli/setup` - pnpm global install and PATH/bin behavior. [CITED: https://pnpm.io/cli/add][CITED: https://pnpm.io/cli/bin][CITED: https://pnpm.io/cli/setup]
- `https://bun.sh/docs/pm/cli/add` - Bun global install and bin-link location. [CITED: https://bun.sh/docs/pm/cli/add]
- `https://classic.yarnpkg.com/lang/en/docs/cli/global/` - Yarn Classic global bin and PATH behavior. [CITED: https://classic.yarnpkg.com/lang/en/docs/cli/global/]
- `npm view commander version time.modified`, `npm view zod version time.modified`, `npm view vitest version time.modified`, `npm view octokit version time.modified`, `npm view tsx version time.modified`, `npm view @legotin/agent-badge version time.modified`, `npm view create-agent-badge version time.modified` - current package versions and publish timestamps. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- None collected; the non-assumption findings above came from direct code inspection, official documentation, and npm-registry queries. [VERIFIED: codebase grep][VERIFIED: npm registry][CITED: https://nodejs.org/api/child_process.html]

### Tertiary (LOW confidence)
- GUI or IDE push environments may require an absolute executable-path fallback instead of a plain PATH-based hook contract. [ASSUMED]
- Yarn-global remediation may need a separate product decision because the official source found during this session was Classic-only. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - it is almost entirely the existing repo stack plus npm-registry verification for current package versions. [VERIFIED: package.json][VERIFIED: npm registry]
- Architecture: MEDIUM - the central recommendation follows directly from the docs and current codebase, but plain-PATH versus absolute-path hook persistence remains an open design choice. [VERIFIED: codebase grep][CITED: https://nodejs.org/api/child_process.html][ASSUMED]
- Pitfalls: MEDIUM - most are verified from current code and official docs, but restricted-PATH hook environments remain partly assumption-driven. [VERIFIED: codebase grep][CITED: https://git-scm.com/docs/githooks][ASSUMED]

**Research date:** 2026-04-08. [VERIFIED: environment context]  
**Valid until:** 2026-05-08 for planning purposes, because package-manager docs are stable but registry versions and local environment facts can drift within a month. [ASSUMED]
