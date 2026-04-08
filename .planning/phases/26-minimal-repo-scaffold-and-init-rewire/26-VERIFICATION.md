---
phase: 26-minimal-repo-scaffold-and-init-rewire
verified: 2026-04-08T22:22:28Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 26: Minimal Repo Scaffold And Init Rewire Verification Report

**Phase Goal:** Make the initializer and scaffold global-first, leaving minimal repo artifacts and no repo-local runtime install by default.
**Verified:** 2026-04-08T22:22:28Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `npm init agent-badge@latest` default init no longer installs repo-local `@legotin/agent-badge` or a repo-local runtime by default. | ✓ VERIFIED | `packages/create-agent-badge/src/index.ts:16-23` is now a thin `runInitCommand()` delegator with no install shellout; `packages/create-agent-badge/package.json` still exposes the initializer bin; `npm test -- --run packages/create-agent-badge/src/index.test.ts` passed `6/6`. |
| 2 | Fresh default init leaves no `package.json`, managed runtime dependency, or managed runtime scripts solely for agent-badge. | ✓ VERIFIED | `packages/agent-badge/src/commands/init.ts:551-563` calls `applyMinimalRepoScaffold()`; `packages/agent-badge/src/commands/init.test.ts:248-257` asserts fresh init creates `.agent-badge` + hook/gitignore while `package.json` stays absent; `packages/agent-badge/src/commands/release-readiness-matrix.test.ts:401-405` asserts `packageJson === null`. |
| 3 | Repo-local artifacts are limited to `.agent-badge/`, README badge markup, managed `.gitignore` entries, and the optional shared-runtime pre-push hook, and missing shared runtime is surfaced explicitly. | ✓ VERIFIED | `packages/core/src/init/runtime-wiring.ts:373-455` only reconciles `.gitignore` and `.git/hooks/pre-push`; `packages/core/src/init/runtime-wiring.ts:172-203` builds the shared-runtime guard and direct `agent-badge refresh` hook block; `packages/agent-badge/src/commands/init.test.ts:283-339` verifies the artifact set plus remediation output. |
| 4 | `config set refresh.prePush.*` rewrites only repo-owned scaffold state and does not recreate repo-local runtime ownership. | ✓ VERIFIED | `packages/agent-badge/src/commands/config.ts:492-499` routes refresh-setting rewrites through `applyMinimalRepoScaffold()`; `packages/agent-badge/src/commands/config.test.ts:264-335` proves strict-mode rewrites keep `package.json` absent on fresh repos and strip legacy managed runtime entries on legacy repos. |
| 5 | Re-running init stays idempotent and converges legacy repos toward the minimal-artifact model without deleting user-owned manifest content. | ✓ VERIFIED | `packages/agent-badge/src/commands/init.test.ts:295-340` verifies reruns reuse one managed hook block; `packages/agent-badge/src/commands/init.test.ts:495-568` verifies legacy reruns keep one README block, one gitignore block, one hook block, and remove only managed agent-badge manifest ownership; `packages/core/src/init/runtime-wiring.test.ts:146-234` proves unrelated manifest content is preserved. |
| 6 | The proof surfaces now encode the minimal-artifact contract and keep legacy uninstall compatibility. | ✓ VERIFIED | `packages/agent-badge/src/commands/release-readiness-matrix.test.ts:173-182` defines “no managed runtime manifest ownership”; `packages/agent-badge/src/commands/release-readiness-matrix.test.ts:401-415` and `:457-518` assert `packageJson === null`, one shared hook block, and no legacy runner strings; `packages/agent-badge/src/commands/uninstall.test.ts:126-211` preserves custom hook content while removing both shared and legacy managed hook blocks. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/create-agent-badge/src/index.ts` | Pure initializer entrypoint with no post-init runtime install step | ✓ VERIFIED | Exists, substantive, and wired through `packages/create-agent-badge/package.json` bin/main plus direct delegation to `runInitCommand()` at `:16-23`. |
| `packages/core/src/init/runtime-wiring.ts` | Minimal repo-scaffold reconciliation with hook/gitignore ownership and legacy manifest cleanup | ✓ VERIFIED | Exists, substantive, and wired from both `runInitCommand()` and `runConfigCommand()`; `applyMinimalRepoScaffold()` at `:457-537` strips managed manifest keys and then calls repo-owned scaffold reconciliation. |
| `packages/agent-badge/src/commands/init.ts` | Init integration using the minimal scaffold contract | ✓ VERIFIED | Exists, substantive, wired from CLI `init` registration in `packages/agent-badge/src/cli/main.ts:61-70`, and calls `applyMinimalRepoScaffold()` at `:559-563`. |
| `packages/agent-badge/src/commands/config.ts` | Refresh-policy rewrites on top of the minimal scaffold contract | ✓ VERIFIED | Exists, substantive, wired from CLI `config` registration in `packages/agent-badge/src/cli/main.ts:192-220`, and rewrites refresh settings through `applyMinimalRepoScaffold()` at `:492-499`. |
| `packages/agent-badge/src/commands/init.test.ts` | Idempotent README and legacy-rerun proof for the minimal-artifact model | ✓ VERIFIED | Exists, substantive, and exercised by passing Vitest suites; contains fresh-init, rerun, and legacy convergence scenarios at `:228-340` and `:495-568`. |
| `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` | Scenario-matrix proof that Phase 26 defaults no longer depend on repo-local runtime manifest ownership | ✓ VERIFIED | Exists, substantive, and exercised by passing Vitest suites; matrix asserts `packageJson === null`, shared hook guard, and no legacy runner strings at `:401-415`, `:457-518`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/create-agent-badge/src/index.ts` | `packages/agent-badge/src/commands/init.ts` | `runCreateAgentBadge -> runInitCommand` | WIRED | `packages/create-agent-badge/src/index.ts:16-23` delegates directly; `packages/create-agent-badge/package.json` exposes the bin entrypoint. |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/init/runtime-wiring.ts` | minimal scaffold reconciliation | WIRED | `packages/agent-badge/src/commands/init.ts:559-563` calls `applyMinimalRepoScaffold()`; implementation lives at `packages/core/src/init/runtime-wiring.ts:457-537`. |
| `packages/agent-badge/src/commands/config.ts` | `packages/core/src/init/runtime-wiring.ts` | refresh-policy scaffold reconciliation | WIRED | `packages/agent-badge/src/commands/config.ts:492-499` calls `applyMinimalRepoScaffold()` for refresh settings. |
| `packages/agent-badge/src/commands/release-readiness-matrix.test.ts` | `packages/agent-badge/src/commands/init.ts` | scenario-matrix contract assertions | WIRED | `packages/agent-badge/src/commands/release-readiness-matrix.test.ts:353-415` runs `runInitCommand()` and asserts the minimal-artifact contract over actual repo fixtures. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/core/src/init/runtime-wiring.ts` | `packageJson` | `readPackageJson(packageJsonPath)` at `:466-467` | Yes — actual manifest content is pruned and then written or deleted at `:517-524` | ✓ FLOWING |
| `packages/agent-badge/src/commands/init.ts` | `config.refresh` | `loadPersistedConfig(preflight.cwd)` at `:555` | Yes — passed directly into `applyMinimalRepoScaffold()` at `:559-563` and used to write hook/gitignore state | ✓ FLOWING |
| `packages/agent-badge/src/commands/config.ts` | `nextConfig.refresh` | `applyConfigMutation(config, options.key, options.value)` at `:488` | Yes — written to config and then reconciled through `applyMinimalRepoScaffold()` at `:490-499` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Pure initializer delegation without repo-local install step | `npm test -- --run packages/create-agent-badge/src/index.test.ts` | `6 passed` in `0.75s` | ✓ PASS |
| Legacy reruns converge to one README block and no managed runtime manifest ownership | `npm test -- --run packages/agent-badge/src/commands/init.test.ts -t "converges legacy reruns to one README block and no managed runtime manifest ownership"` | `1 passed` in `1.71s` | ✓ PASS |
| Config rewrite removes managed runtime ownership on legacy repos | `npm test -- --run packages/agent-badge/src/commands/config.test.ts -t "removes managed runtime manifest ownership when refresh settings rewrite a legacy repo hook"` | `1 passed` in `0.95s` | ✓ PASS |
| Readiness proof keeps the shared managed hook contract for npm repos | `npm test -- --run packages/agent-badge/src/commands/release-readiness-matrix.test.ts -t "writes the shared managed hook contract for 'npm' repos"` | `1 passed` in `1.38s` | ✓ PASS |

Broader confirmation suites also passed:
- `npm test -- --run packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/commands/uninstall.test.ts` → `45/45` tests passed.
- `npm test -- --run packages/agent-badge/src/commands/release-readiness-matrix.test.ts packages/agent-badge/src/commands/init.test.ts` → `33/33` tests passed.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `DIST-01` | `26-01`, `26-02` | Developer can install `agent-badge` once at global or user scope and reuse that CLI across repositories without adding `@legotin/agent-badge` to each repo's dependencies. | ✓ SATISFIED | Hook generation uses shared `agent-badge` resolution and remediation (`packages/core/src/init/runtime-wiring.ts:172-203`); fresh init and config/rerun tests remove repo-local dependency and script ownership (`packages/agent-badge/src/commands/init.test.ts:255-293`, `packages/agent-badge/src/commands/config.test.ts:323-334`). |
| `DIST-02` | `26-01`, `26-02` | `npm init agent-badge@latest` initializes the current repository without creating repo-local `node_modules` or adding the runtime package to the repo manifest or lockfile by default. | ✓ SATISFIED | The initializer entrypoint is direct delegation only (`packages/create-agent-badge/src/index.ts:16-23`); fresh-init tests keep `package.json` absent (`packages/agent-badge/src/commands/init.test.ts:248-257`); readiness matrix asserts `packageJson === null` across scenarios (`packages/agent-badge/src/commands/release-readiness-matrix.test.ts:399-405`). |
| `ART-01` | `26-01`, `26-02` | After init, the repo only contains repo-specific agent-badge artifacts needed for operation: `.agent-badge/` data, README badge markup, gitignore entries, and optional git hook content. | ✓ SATISFIED | `applyRepoOwnedScaffold()` only reconciles `.gitignore` and pre-push hook (`packages/core/src/init/runtime-wiring.ts:373-455`); `.agent-badge` scaffold and README updates are asserted in init/readiness tests (`packages/agent-badge/src/commands/init.test.ts:242-293`, `packages/agent-badge/src/commands/release-readiness-matrix.test.ts:401-415`). |
| `ART-02` | `26-02` | Re-running init remains idempotent under the new model and does not duplicate hook blocks, README badges, or repo-owned config while keeping the artifact footprint minimal. | ✓ SATISFIED | Fresh rerun and legacy rerun tests assert single marker blocks and minimal artifacts (`packages/agent-badge/src/commands/init.test.ts:295-340`, `:495-568`); scenario matrix asserts idempotent reinit and one hook block (`packages/agent-badge/src/commands/release-readiness-matrix.test.ts:323-415`). |

Orphaned requirements: none. All Phase 26 requirement IDs in `.planning/REQUIREMENTS.md` (`DIST-01`, `DIST-02`, `ART-01`, `ART-02`) appear in Phase 26 plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | No blocker or warning anti-patterns detected in the Phase 26 files. | — | `rg` hits were limited to expected nullable control flow and test scaffolding; no TODO/FIXME placeholders, console-log-only implementations, or user-visible stub returns were found. |

### Gaps Summary

No blocking gaps found. The source changes, command wiring, regression tests, and targeted behavioral spot-checks all support the Phase 26 contract.

Residual risks from the disconfirmation pass:
- `packages/create-agent-badge/src/index.test.ts:96-129` proves the no-`package.json` case with a mocked `runInitCommand()` rather than an end-to-end published initializer run. That does not block this phase because real fresh-init and readiness-matrix tests verify the minimal-artifact contract through `runInitCommand()`, and clean published-package smoke proof is explicitly planned for Phase 27.
- I found no direct test for the config rollback path in `packages/agent-badge/src/commands/config.ts:500-507` if scaffold reconciliation fails after writing the updated config. That is a coverage gap on an error path, not evidence that the Phase 26 goal failed.

---

_Verified: 2026-04-08T22:22:28Z_
_Verifier: Claude (gsd-verifier)_
