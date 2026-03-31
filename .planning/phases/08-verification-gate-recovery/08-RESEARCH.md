# Phase 8: Verification Gate Recovery - Research

**Researched:** 2026-03-31  
**Domain:** TypeScript workspace build recovery, fixture rebaseline, and release-critical verification hardening  
**Confidence:** HIGH

## User Constraints

- No Phase 8 CONTEXT.md exists, so there are no locked phase-specific decisions to preserve.
- Scope is locked to REL-04, REL-05, and REL-06 from `.planning/REQUIREMENTS.md`.
- Deferred v2 ideas in `.planning/REQUIREMENTS.md` are out of scope for this phase.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-04 | Maintainer can run `npm run build` successfully from committed source on a supported Node version without TypeScript errors. | Fix the Octokit gist client typing boundary in `packages/core/src/publish/github-gist-client.ts` and verify the build on the supported Node line, not on a prebuilt `dist/` tree. |
| REL-05 | Maintainer can run `npm test` successfully from committed source, including doctor coverage and Claude incremental refresh coverage. | Rebaseline the stale doctor fixture to current state schema shape and make the Claude incremental test deterministic relative to current cursor/file mtimes. |
| REL-06 | Maintainer can verify release-critical checks against the current config/state schemas and current source behavior without fixture drift or stale build artifacts affecting the result. | Add or tighten a clean-checkout verification path that does not reuse stale `dist/` outputs, stale fixture state, or a root-owned npm cache. |

## Summary

The current failure set is narrow and actionable. `npm run build` is blocked by one TypeScript boundary in `packages/core/src/publish/github-gist-client.ts`, where the local `OctokitLike` seam no longer matches the installed Octokit gist API shape. `npm test -- --run` fails in exactly two areas: three doctor tests are constructing state with an old config-shaped fixture instead of current `AgentBadgeState`, and one Claude incremental test is using a fixed timestamp that is earlier than the copied fixture mtime on this machine, so the incremental scan correctly returns zero changed files.

Release-critical verification also has a stale-artifact problem. The repo already contains ignored `packages/*/dist/` trees, and the pack smoke output shows test artifacts are still present in emitted tarball contents. That means a plain pack/install check can be polluted by old `dist` output even when source has changed. Phase 8 should therefore recover the gates with a clean-checkout or explicit clean-build verification path, not just by rerunning the current workspace in place.

**Primary recommendation:** fix the Octokit gist adapter, rebase the stale doctor and Claude incremental tests to current schemas/timestamps, and make the release verification path clean `dist/` artifacts before pack/install checks.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 24.x LTS, support >=20.x | CLI runtime, filesystem, HTTP, child process integration | Matches the project support floor and the release matrix already used in CI. |
| TypeScript | 5.x | Workspace build and shared domain types | The repo uses strict schema-heavy code; build-time typing is the main guardrail. |
| npm workspaces | npm 10.x+ | Monorepo packaging and local linking | The repo ships `@agent-badge/core`, `agent-badge`, and `create-agent-badge` together. |
| Vitest | 3.2.4 installed, 4.1.2 latest | Unit and integration test runner | The repo already uses fixture-heavy Vitest tests across packages. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `commander` | 14.0.3 latest | CLI routing and help text | Use for runtime command parsing in `packages/agent-badge`. |
| `octokit` | 5.0.5 latest | GitHub Gist transport and GitHub REST access | Use for all gist operations instead of handwritten fetch wrappers. |
| `zod` | 4.3.6 latest | Config/state/schema validation | Use at every boundary that reads persisted or external data. |
| `tsx` | 4.21.0 latest | Run local TypeScript entrypoints during development | Use for local CLI execution and debug loops. |
| `@changesets/cli` | 2.30.0 latest | Monorepo release/versioning workflow | Use for release orchestration, not custom publish scripts. |
| `simple-git-hooks` | 2.13.1 latest | Lightweight hook installation helper | Only relevant if direct hook management becomes brittle again. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Octokit gist client | Handwritten `fetch` calls | More code, weaker typing, and more auth/pagination edge cases. |
| Zod schemas | Manual JSON parsing | Easier to drift from persisted shape and harder to keep strict privacy boundaries. |
| Temp-pack smoke only | Source-only tests | Misses stale build outputs and tarball content drift. |
| In-place workspace verification | Clean temp checkout or `git clean -fdX` gate | Slightly slower, but it prevents stale `dist/` artifacts from hiding regressions. |

**Installation:**
```bash
npm install
```

**Version verification:** verified from the npm registry on 2026-03-31 with `npm view <pkg> version time.modified --json`.
- `commander` `14.0.3` (`2026-02-21T07:16:08.008Z`)
- `octokit` `5.0.5` (`2025-10-31T02:27:35.085Z`)
- `zod` `4.3.6` (`2026-01-25T21:51:57.252Z`)
- `vitest` `4.1.2` (`2026-03-26T14:36:51.783Z`)
- `tsx` `4.21.0` (`2025-11-30T15:56:09.695Z`)
- `@changesets/cli` `2.30.0` (`2026-03-03T09:55:56.250Z`)
- `simple-git-hooks` `2.13.1` (`2025-07-31T21:02:21.896Z`)
- `typescript` `6.0.2` (`2026-03-28T01:14:01.889Z`)

## Architecture Patterns

### Recommended Project Structure
```text
packages/
├── core/                 # schemas, scanners, attribution, publish helpers
├── agent-badge/          # CLI command layer
├── create-agent-badge/   # initializer entrypoint
└── testkit/              # temp repo/home fixtures and provider seeds
scripts/
└── smoke/verify-packed-install.sh
```

### Pattern 1: Core Schemas Own Persisted State
**What:** `packages/core/src/state/state-schema.ts` is the canonical shape for `.agent-badge/state.json`, and `packages/core/src/config/config-schema.ts` is the canonical shape for `.agent-badge/config.json`.
**When to use:** whenever tests or fixtures need to write persisted config/state.
**Example:**
```ts
// Source: /Volumes/git/legotin/agent-badge/packages/core/src/state/state-schema.ts
export const defaultAgentBadgeState = {
  version: 1,
  init: { initialized: false, scaffoldVersion: 1, lastInitializedAt: null },
  checkpoints: {
    codex: { cursor: null, lastScannedAt: null },
    claude: { cursor: null, lastScannedAt: null }
  },
  publish: { status: "idle", gistId: null, lastPublishedHash: null, lastPublishedAt: null },
  refresh: { lastRefreshedAt: null, lastScanMode: null, lastPublishDecision: null, summary: null },
  overrides: { ambiguousSessions: {} }
};
```

### Pattern 2: Fixture-First Verification
**What:** tests create temp repo and temp home fixtures instead of reading the developer machine state.
**When to use:** command tests, provider scanners, and release-readiness checks.
**Example:**
```ts
// Source: /Volumes/git/legotin/agent-badge/packages/testkit/src/provider-fixtures.ts
const homeRoot = await mkdtemp(join(tmpdir(), "agent-badge-home-"));
await mkdir(join(homeRoot, ".codex"), { recursive: true });
await mkdir(join(homeRoot, ".claude"), { recursive: true });
```

### Pattern 3: Incremental Refresh Uses Current Cursor Helpers
**What:** provider-specific incremental cursors are derived from current source state, then compared against file mtimes or session watermarks.
**When to use:** all refresh and release-readiness scans.
**Example:**
```ts
// Source: /Volumes/git/legotin/agent-badge/packages/core/src/scan/incremental-refresh.ts
if (options.forceFull || providers.length === 0) {
  return runFullRefresh(options, providers);
}
```

### Anti-Patterns to Avoid
- **Using config-shaped objects as state fixtures:** `parseAgentBadgeState` is strict and now rejects missing `init`, `checkpoints`, `refresh`, and `overrides`.
- **Anchoring incremental tests to a fixed historical timestamp:** fixture copy times on the current machine can make the scan watermark newer than the hard-coded mtime.
- **Verifying tarballs against stale `dist/` output:** `npm pack` will happily package whatever is already in `dist/` unless the build/verification path starts clean.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gist API transport | Custom `fetch` wrappers | `createGitHubGistClient()` with Octokit | Keeps auth, payload shapes, and delete/update semantics in one seam. |
| Persisted config/state parsing | Manual JSON shape checks in tests | `parseAgentBadgeConfig()` / `parseAgentBadgeState()` | Matches runtime validation exactly. |
| Release smoke validation | Ad hoc tarball inspection | `scripts/smoke/verify-packed-install.sh` | Exercises real pack/install/import/bin behavior. |
| Clean-checkout verification | Guessing whether `dist/` is stale | Fresh checkout or explicit clean step before build/test/pack | Prevents old build artifacts from hiding source regressions. |

**Key insight:** the remaining gate failures are not broad system design issues; they are boundary mismatches and stale verification inputs. The recovery path is to align the tests and adapters to the current runtime contracts, then verify from a genuinely clean source state.

## Runtime State Inventory

> Phase 8 is a verification-gate recovery phase, not a rename/refactor/migration phase. Runtime state inventory is not required.

## Common Pitfalls

### Pitfall 1: Stale `dist/` Artifacts Mask the Real Source State
**What goes wrong:** `npm pack` or smoke installs pick up old emitted test files and outdated JS from previous builds.
**Why it happens:** `tsc -b` does not clean existing output directories by itself.
**How to avoid:** clean `packages/*/dist` before release-critical verification, or run the checks from a fresh checkout/worktree.
**Warning signs:** tarball contents include `*.test.js` or `*.test.d.ts` even when source tsconfigs exclude test files.

### Pitfall 2: Doctor Fixtures Drift from the State Schema
**What goes wrong:** tests write config-shaped objects into `.agent-badge/state.json`.
**Why it happens:** the state schema evolved to include `init`, `checkpoints`, `refresh`, and `overrides`.
**How to avoid:** seed tests from `defaultAgentBadgeState` or `createDefaultAgentBadgeState()`.
**Warning signs:** Zod errors mentioning missing `init`, `checkpoints`, or unrecognized config keys like `providers` and `privacy`.

### Pitfall 3: Incremental Tests Depend on the Clock
**What goes wrong:** a fixed mtime is older than the fixture copy time, so the incremental scan returns no changed sessions.
**Why it happens:** `buildClaudeIncrementalCursorFromSource()` keys off file mtimes and sizes, not the JSON timestamps inside the transcript.
**How to avoid:** derive a post-cursor mtime from the current fixture state or from `Date.now() + delta`.
**Warning signs:** the test expects one changed session and receives zero.

### Pitfall 4: Local npm Cache Permissions Break Pack Checks
**What goes wrong:** `npm run pack:check` fails with root-owned cache errors on this machine.
**Why it happens:** the global `~/.npm` cache is not writable by the current user.
**How to avoid:** use an isolated temporary npm cache for pack verification, as the smoke script already does.
**Warning signs:** `EPERM` or root-owned cache messages from npm before any pack output.

## Code Examples

Verified patterns from local source:

### Current State Baseline
```ts
// Source: /Volumes/git/legotin/agent-badge/packages/core/src/state/state-schema.ts
parseAgentBadgeState(defaultAgentBadgeState);
```

### Doctor Fixture Pattern
```ts
// Source: /Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/doctor.test.ts
await writeJsonFile(repoRoot, ".agent-badge/state.json", defaultAgentBadgeState);
```

### Deterministic Incremental Cursor Flow
```ts
// Source: /Volumes/git/legotin/agent-badge/packages/core/src/providers/claude/claude-adapter.ts
const nextCursor = buildClaudeIncrementalCursorFromFiles(files);
const previousCursor = parseClaudeIncrementalCursor(cursor);
```

### Clean Pack Smoke Script
```bash
# Source: /Volumes/git/legotin/agent-badge/scripts/smoke/verify-packed-install.sh
NPM_CACHE_DIR="${WORK_DIR}/npm-cache"
npm_config_cache="${NPM_CACHE_DIR}" npm pack --workspace packages/core --pack-destination "${PACK_DIR}"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Config-shaped object in doctor test fixtures | `defaultAgentBadgeState` / strict state schema | Current state schema | Fixes Zod drift and matches runtime persistence exactly. |
| Fixed historical mtime for Claude incremental tests | mtime derived from current fixture/cursor state | Current incremental adapter behavior | Makes the test deterministic across machines and dates. |
| Pack/install against whatever is already in `dist/` | Clean checkout or explicit `dist` cleanup before pack smoke | Release-hardening requirement | Prevents stale test artifacts from masquerading as passing release checks. |
| Broad manual publish validation | CI-backed docs, pack, and smoke gates | Phase 7/8 release hardening | Makes release verification reproducible. |

**Deprecated/outdated:**
- Using `parseAgentBadgeState({...defaultAgentBadgeConfig...})` in tests is outdated and now invalid.
- Treating `dist/` as disposable-but-implicit is outdated; release verification must prove it is clean.

## Open Questions

1. **Should the clean-checkout gate be a dedicated script or a CI job pre-step?**
   - What we know: stale `dist/` output is real, and `npm pack` can package it.
   - What's unclear: whether the team wants a reusable script, a CI-only cleanup, or both.
   - Recommendation: add a small reusable clean-verification script and call it from CI.

2. **Should the gist client delete method name be updated to match the current Octokit API directly?**
   - What we know: the current cast fails because `rest.gists.remove` is no longer in the installed type shape.
   - What's unclear: whether the runtime path currently needs `delete`, a wrapper method, or a narrower type seam.
   - Recommendation: align the adapter and its test doubles to the installed Octokit gist API before widening scope.

3. **Should the Claude incremental test key off file mtimes or a helper-provided future timestamp?**
   - What we know: the current fixed date can be older than the fixture copy time.
   - What's unclear: whether the team wants a clock injection helper or a simple `Date.now()` delta in the test.
   - Recommendation: keep the test deterministic by making the written mtime obviously newer than the cursor watermark.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Build/test/release verification | Yes | v22.14.0 | Use the CI matrix on 20.x, 22.x, and 24.x |
| npm | Workspace build, pack, install smoke | Yes | 11.6.0 | Use isolated temp npm cache if the default cache is root-owned |
| git | Clean checkout / worktree verification | Yes | 2.49.0 | Use a temp worktree or temp clone if needed |
| Vitest | Test runner | Yes | 3.2.4 via `npx` | Use the workspace-installed runner from `npm test` |
| npm registry access | Packed install smoke | Not conclusively verified in this local run | — | Run in CI or a machine with registry access if the temp install stalls |

**Missing dependencies with no fallback:**
- None identified for source-level planning.

**Missing dependencies with fallback:**
- `npm run pack:check` is blocked by the local root-owned npm cache; use a temp cache or CI.
- Packed-install smoke depends on temp install behavior that was not fully observed to completion in this environment; use CI if local registry access is constrained.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm run typecheck && npm run build && npm test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REL-04 | Build from committed source with no TypeScript errors | build gate | `npm run build` | Yes |
| REL-05 | Doctor coverage and Claude incremental refresh coverage pass | unit/integration | `npm test -- --run packages/core/src/diagnostics/doctor.test.ts packages/core/src/providers/claude/claude-adapter.test.ts` | Yes |
| REL-06 | Release-critical checks run against current schemas and clean artifacts | release verification | `npm test -- --run packages/agent-badge/src/commands/release-readiness-matrix.test.ts && npm run docs:check && npm run pack:check && npm run smoke:pack` | Yes |

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm run typecheck && npm run build && npm test -- --run`
- **Phase gate:** Clean-checkout build/test/pack verification green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] A clean-checkout verification step that explicitly clears stale `dist/` output or uses a fresh checkout/worktree before pack smoke.
- [ ] `packages/core/src/diagnostics/doctor.test.ts` fixture rebaseline to current `AgentBadgeState`.
- [ ] `packages/core/src/providers/claude/claude-adapter.test.ts` deterministic future-mtime update.
- [ ] A documented workaround for `npm run pack:check` on machines with root-owned `~/.npm`.

## Sources

### Primary (HIGH confidence)
- `/Volumes/git/legotin/agent-badge/packages/core/src/publish/github-gist-client.ts`
- `/Volumes/git/legotin/agent-badge/packages/core/src/state/state-schema.ts`
- `/Volumes/git/legotin/agent-badge/packages/core/src/diagnostics/doctor.ts`
- `/Volumes/git/legotin/agent-badge/packages/core/src/diagnostics/doctor.test.ts`
- `/Volumes/git/legotin/agent-badge/packages/core/src/providers/claude/claude-adapter.ts`
- `/Volumes/git/legotin/agent-badge/packages/core/src/providers/claude/claude-adapter.test.ts`
- `/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/doctor.test.ts`
- `/Volumes/git/legotin/agent-badge/scripts/smoke/verify-packed-install.sh`
- `/Volumes/git/legotin/agent-badge/.planning/REQUIREMENTS.md`
- `/Volumes/git/legotin/agent-badge/.planning/STATE.md`

### Secondary (MEDIUM confidence)
- `npm view commander version time.modified --json`
- `npm view octokit version time.modified --json`
- `npm view zod version time.modified --json`
- `npm view vitest version time.modified --json`
- `npm view tsx version time.modified --json`
- `npm view @changesets/cli version time.modified --json`
- `npm view simple-git-hooks version time.modified --json`
- `npm view typescript version time.modified --json`

### Tertiary (LOW confidence)
- None; the phase findings are grounded in current source and local command output.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified against current npm registry versions and current repo manifests.
- Architecture: HIGH - directly supported by current source structure and passing command-level tests.
- Pitfalls: HIGH - derived from concrete failing commands and tarball output on this machine.

**Research date:** 2026-03-31  
**Valid until:** 2026-04-30
