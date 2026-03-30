---
phase: 05-incremental-refresh-and-operator-commands
verified: 2026-03-30T19:26:03Z
status: human_needed
score: 4/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "`refresh` performs an incremental scan from persisted checkpoints instead of a full historical rescan."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Managed pre-push latency and Git bypass"
    expected: "Default hook remains failure-soft, does not noticeably delay a normal push, and `git push --no-verify` skips the hook."
    why_human: "Requires a real repository plus live `~/.codex` and `~/.claude` histories to assess operator-perceived latency and actual Git hook invocation semantics."
---

# Phase 05: Incremental Refresh and Operator Commands Verification Report

**Phase Goal:** Make day-to-day badge maintenance fast, transparent, and low-friction.
**Verified:** 2026-03-30T19:26:03Z
**Status:** human_needed
**Re-verification:** Yes - after SCAN-04 gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `refresh` performs an incremental scan from persisted checkpoints instead of a full historical rescan. | ✓ VERIFIED | `scanCodexSessionsIncremental()` now uses `loadCodexThreadRowsSince()` on valid cursors instead of rereading all Codex sessions ([packages/core/src/providers/codex/codex-adapter.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/codex/codex-adapter.ts#L342), [packages/core/src/providers/codex/codex-sql.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/codex/codex-sql.ts#L125)). `scanClaudeSessionsIncremental()` now lists project files, filters `changedFiles`, and loads only those files incrementally ([packages/core/src/providers/claude/claude-adapter.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/claude/claude-adapter.ts#L264), [packages/core/src/providers/claude/claude-jsonl.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/claude/claude-jsonl.ts#L101)). `runIncrementalRefresh()` stays incremental unless cache/cursors are unusable or a provider explicitly reports `mode: "full"` ([packages/core/src/scan/incremental-refresh.ts](/Volumes/git/legotin/agent-badge/packages/core/src/scan/incremental-refresh.ts#L236)). |
| 2 | Publish is skipped when the visible badge value has not changed. | ✓ VERIFIED | `publishBadgeIfChanged()` hashes the exact serialized endpoint payload and returns `"skipped"` before any Gist update when the hash matches ([packages/core/src/publish/publish-service.ts](/Volumes/git/legotin/agent-badge/packages/core/src/publish/publish-service.ts#L87)); covered by `packages/core/src/publish/publish-service.test.ts` and the post-fix regression sweep. |
| 3 | `status` shows totals, provider enablement, publish state, and checkpoint timestamps clearly. | ✓ VERIFIED | `runStatusCommand()` reads only persisted config/state and prints the required headings, totals, provider enablement, publish status, last refresh, and checkpoints ([packages/agent-badge/src/commands/status.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/status.ts#L195)). |
| 4 | `config` can change badge mode, label, providers, privacy, and refresh settings after init. | ✓ VERIFIED | `runConfigCommand()` allowlists supported keys, validates mutations through the shared schema, prevents disabling aggregate-only publishing, and reconciles runtime wiring when `refresh.prePush.*` changes ([packages/agent-badge/src/commands/config.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts#L168), [packages/agent-badge/src/commands/config.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts#L325)). |
| 5 | Default `pre-push` automation remains failure-soft and fast enough for normal git usage. | ? UNCERTAIN | Code and tests verify default fail-soft wiring, strict/disabled reconciliation, single managed block ownership, concise pre-push output, and strict-vs-soft error handling ([packages/core/src/runtime/local-cli.ts](/Volumes/git/legotin/agent-badge/packages/core/src/runtime/local-cli.ts#L32), [packages/core/src/init/runtime-wiring.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.ts#L197), [packages/core/src/init/runtime-wiring.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.test.ts#L71), [packages/agent-badge/src/commands/refresh.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/refresh.test.ts#L307)). Real push latency and `git push --no-verify` still require human confirmation in a live repo. |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/core/src/scan/incremental-refresh.ts` | Incremental refresh orchestration | ✓ VERIFIED | Reads the derived cache, runs provider incremental scans, and only falls back when cache/cursors are unusable or a provider reports `mode: "full"` ([packages/core/src/scan/incremental-refresh.ts](/Volumes/git/legotin/agent-badge/packages/core/src/scan/incremental-refresh.ts#L236)). |
| `packages/core/src/providers/codex/codex-adapter.ts` | Codex incremental provider input | ✓ VERIFIED | Valid cursor path uses a watermark-aware delta query and advances the cursor from changed sessions instead of rereading all sessions ([packages/core/src/providers/codex/codex-adapter.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/codex/codex-adapter.ts#L342)). |
| `packages/core/src/providers/codex/codex-sql.ts` | Codex delta query support | ✓ VERIFIED | `loadCodexThreadRowsSince()` selects only rows newer than the prior watermark, plus unseen ids at the watermark boundary ([packages/core/src/providers/codex/codex-sql.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/codex/codex-sql.ts#L125)). |
| `packages/core/src/providers/claude/claude-adapter.ts` | Claude incremental provider input | ✓ VERIFIED | Incremental path lists project files, filters changed files, and reads only those files when the cursor is valid ([packages/core/src/providers/claude/claude-adapter.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/claude/claude-adapter.ts#L264)). |
| `packages/core/src/providers/claude/claude-jsonl.ts` | Claude file inventory and selective loader | ✓ VERIFIED | Exposes file metadata and `readClaudeProjectJsonlSessionsFromFiles()` so incremental scans can load changed files only ([packages/core/src/providers/claude/claude-jsonl.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/claude/claude-jsonl.ts#L101)). |
| `packages/core/src/scan/refresh-cache.ts` | Aggregate-only session-index cache | ✓ VERIFIED | Artifact verification passed; regression tests still cover stable-key cache persistence without transcript/path fields. |
| `packages/core/src/state/state-schema.ts` | Refresh summary and publish timestamp state contract | ✓ VERIFIED | Artifact verification passed; `state-schema.test.ts` remains green in the post-fix sweep. |
| `packages/core/src/publish/publish-service.ts` | Exact-payload hash-aware publish skipping | ✓ VERIFIED | Exact serialized payload hashing still governs the skip/publish branch ([packages/core/src/publish/publish-service.ts](/Volumes/git/legotin/agent-badge/packages/core/src/publish/publish-service.ts#L87)). |
| `packages/agent-badge/src/commands/refresh.ts` | End-to-end refresh command | ✓ VERIFIED | Persists state/cache before optional publish, records `lastPublishDecision`, and supports fail-soft behavior ([packages/agent-badge/src/commands/refresh.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/refresh.ts#L189)). |
| `packages/agent-badge/src/commands/status.ts` | Persisted-only operator status command | ✓ VERIFIED | Reads config/state only and prints the required operator view ([packages/agent-badge/src/commands/status.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/status.ts#L195)). |
| `packages/agent-badge/src/commands/config.ts` | Validated post-init config mutation surface | ✓ VERIFIED | Applies validated config changes and rewires runtime automation when needed ([packages/agent-badge/src/commands/config.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts#L325)). |
| `packages/core/src/runtime/local-cli.ts` | Mode-aware refresh script builder | ✓ VERIFIED | Emits exact fail-soft and strict pre-push commands ([packages/core/src/runtime/local-cli.ts](/Volumes/git/legotin/agent-badge/packages/core/src/runtime/local-cli.ts#L32)). |
| `packages/core/src/init/runtime-wiring.ts` | Config-aware managed hook reconciliation | ✓ VERIFIED | Rewrites only the managed block, preserves unrelated hook content, and removes the block cleanly when disabled ([packages/core/src/init/runtime-wiring.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.ts#L197)). |
| `packages/agent-badge/src/commands/init.ts` | Init-time refresh wiring hookup | ✓ VERIFIED | Passes persisted `config.refresh` into runtime wiring on init/rerun ([packages/agent-badge/src/commands/init.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.ts#L394)). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/scan/incremental-refresh.ts` | `packages/core/src/providers/codex/codex-adapter.ts` | `scanCodexSessionsIncremental` | ✓ WIRED | `runIncrementalRefresh()` calls the Codex incremental adapter and consumes `{ sessions, cursor, mode }` directly ([packages/core/src/scan/incremental-refresh.ts](/Volumes/git/legotin/agent-badge/packages/core/src/scan/incremental-refresh.ts#L199)). |
| `packages/core/src/providers/codex/codex-adapter.ts` | `packages/core/src/providers/codex/codex-sql.ts` | `loadCodexThreadRowsSince` | ✓ WIRED | Valid cursor path now uses `loadCodexThreadRowsSince()` rather than the full scan helper ([packages/core/src/providers/codex/codex-adapter.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/codex/codex-adapter.ts#L360), [packages/core/src/providers/codex/codex-sql.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/codex/codex-sql.ts#L125)). |
| `packages/core/src/scan/incremental-refresh.ts` | `packages/core/src/providers/claude/claude-adapter.ts` | `scanClaudeSessionsIncremental` | ✓ WIRED | `runIncrementalRefresh()` calls the Claude incremental adapter and stays incremental unless that provider returns `mode: "full"` ([packages/core/src/scan/incremental-refresh.ts](/Volumes/git/legotin/agent-badge/packages/core/src/scan/incremental-refresh.ts#L219)). |
| `packages/core/src/providers/claude/claude-adapter.ts` | `packages/core/src/providers/claude/claude-jsonl.ts` | changed-file loader | ✓ WIRED | Adapter lists project files, filters `changedFiles`, and loads only those files through `readClaudeProjectJsonlSessionsFromFiles()` ([packages/core/src/providers/claude/claude-adapter.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/claude/claude-adapter.ts#L268), [packages/core/src/providers/claude/claude-jsonl.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/claude/claude-jsonl.ts#L165)). |
| `packages/core/src/scan/incremental-refresh.ts` | `packages/core/src/scan/refresh-cache.ts` | cache read and merge | ✓ WIRED | Reads cache before scanning and merges changed attributed sessions back into the cache before summarizing ([packages/core/src/scan/incremental-refresh.ts](/Volumes/git/legotin/agent-badge/packages/core/src/scan/incremental-refresh.ts#L247)). |
| `packages/agent-badge/src/commands/refresh.ts` | `packages/core/src/scan/incremental-refresh.ts` | `runIncrementalRefresh()` | ✓ WIRED | Refresh command delegates scanning to the core incremental service ([packages/agent-badge/src/commands/refresh.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/refresh.ts#L192)). |
| `packages/agent-badge/src/commands/refresh.ts` | `packages/core/src/publish/publish-service.ts` | `publishBadgeIfChanged()` | ✓ WIRED | Refresh uses the skip-aware publish helper after persisting local state/cache ([packages/agent-badge/src/commands/refresh.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/refresh.ts#L243)). |
| `packages/agent-badge/src/commands/status.ts` | persisted config/state | `readJsonFile()` + parsers | ✓ WIRED | Status reads only `.agent-badge/config.json` and `.agent-badge/state.json` before formatting output ([packages/agent-badge/src/commands/status.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/status.ts#L200)). |
| `packages/agent-badge/src/commands/config.ts` | `packages/core/src/config/config-schema.ts` | validated mutations | ✓ WIRED | All supported mutations flow through `parseAgentBadgeConfig()` and typed coercion helpers ([packages/agent-badge/src/commands/config.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts#L172)). |
| `packages/agent-badge/src/commands/config.ts` | `packages/core/src/init/runtime-wiring.ts` | `applyRepoLocalRuntimeWiring()` | ✓ WIRED | Successful `refresh.prePush.*` mutations immediately reconcile the repo-local script and hook ([packages/agent-badge/src/commands/config.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts#L377)). |
| `packages/agent-badge/src/commands/init.ts` | `packages/core/src/init/runtime-wiring.ts` | persisted `config.refresh` | ✓ WIRED | Init/rerun passes persisted refresh settings into runtime wiring instead of assuming defaults ([packages/agent-badge/src/commands/init.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/init.ts#L394)). |
| `packages/core/src/init/runtime-wiring.ts` | `packages/core/src/runtime/local-cli.ts` | script and hook command builders | ✓ WIRED | Managed wiring derives the refresh script command from `getAgentBadgeRefreshScriptCommand(options.refresh.prePush.mode)` ([packages/core/src/init/runtime-wiring.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.ts#L247), [packages/core/src/runtime/local-cli.ts](/Volumes/git/legotin/agent-badge/packages/core/src/runtime/local-cli.ts#L32)). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/core/src/providers/codex/codex-adapter.ts` | `sessions` | SQLite `threads` delta query via `loadCodexThreadRowsSince()` | Yes | ✓ FLOWING |
| `packages/core/src/providers/claude/claude-adapter.ts` | `sessions` | Changed Claude project JSONL files via `listClaudeProjectJsonlFiles()` and `readClaudeProjectJsonlSessionsFromFiles(changedFiles)` | Yes | ✓ FLOWING |
| `packages/core/src/scan/incremental-refresh.ts` | `summary` | Provider incremental outputs merged into `.agent-badge/cache/session-index.json` and re-attributed for changed sessions | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/refresh.ts` | `persistedState.refresh` | `runIncrementalRefresh()` result -> state/cache writes -> optional publish decision | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/status.ts` | operator report | `.agent-badge/config.json` and `.agent-badge/state.json` only | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/config.ts` | `nextConfig.refresh.prePush` | parsed config mutation -> `applyRepoLocalRuntimeWiring()` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| True provider incremental scanning | `node node_modules/vitest/vitest.mjs --run packages/core/src/providers/codex/codex-adapter.test.ts packages/core/src/providers/claude/claude-adapter.test.ts packages/core/src/scan/incremental-refresh.test.ts` | 3 files, 14 tests passed | ✓ PASS |
| Publish skip, operator commands, and managed hook reconciliation | `node node_modules/vitest/vitest.mjs --run packages/core/src/publish/publish-service.test.ts packages/core/src/init/runtime-wiring.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/config.test.ts` | 6 files, 34 tests passed | ✓ PASS |
| Phase 05 regression sweep after the incremental fix | `node node_modules/vitest/vitest.mjs --run packages/core/src/state/state-schema.test.ts packages/core/src/config/config-schema.test.ts packages/core/src/scan/refresh-cache.test.ts packages/core/src/scan/incremental-refresh.test.ts packages/core/src/providers/codex/codex-adapter.test.ts packages/core/src/providers/claude/claude-adapter.test.ts packages/core/src/publish/publish-service.test.ts packages/core/src/runtime/local-cli.test.ts packages/core/src/init/runtime-wiring.test.ts packages/core/src/init/scaffold.test.ts packages/core/src/init/preflight.test.ts packages/core/src/scan/full-backfill.test.ts packages/core/src/scan/scan-report.test.ts packages/core/src/attribution/attribution-engine.test.ts packages/core/src/publish/publish-state.test.ts packages/core/src/publish/badge-payload.test.ts packages/core/src/publish/github-gist-client.test.ts packages/core/src/publish/readme-badge.test.ts packages/agent-badge/src/commands/init.test.ts packages/agent-badge/src/commands/publish.test.ts packages/agent-badge/src/commands/scan.test.ts packages/agent-badge/src/commands/refresh.test.ts packages/agent-badge/src/commands/status.test.ts packages/agent-badge/src/commands/config.test.ts packages/agent-badge/src/cli/main.test.ts` | 25 files, 125 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `SCAN-04` | `05-01`, `05-02` | `refresh` performs incremental scanning using persisted checkpoints instead of a full historical rescan. | ✓ SATISFIED | Codex now queries only rows newer than the stored watermark and Claude now loads only changed JSONL files; `runIncrementalRefresh()` preserves incremental mode on valid cursors ([packages/core/src/providers/codex/codex-adapter.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/codex/codex-adapter.ts#L342), [packages/core/src/providers/codex/codex-sql.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/codex/codex-sql.ts#L125), [packages/core/src/providers/claude/claude-adapter.ts](/Volumes/git/legotin/agent-badge/packages/core/src/providers/claude/claude-adapter.ts#L264), [packages/core/src/scan/incremental-refresh.ts](/Volumes/git/legotin/agent-badge/packages/core/src/scan/incremental-refresh.ts#L263)). |
| `PUBL-05` | `05-01` | Publish skips remote updates when the visible badge value has not changed. | ✓ SATISFIED | Exact serialized endpoint payload hash comparison still short-circuits remote writes ([packages/core/src/publish/publish-service.ts](/Volumes/git/legotin/agent-badge/packages/core/src/publish/publish-service.ts#L99)). |
| `OPER-01` | `05-03` | Default `pre-push` integration runs a fast failure-soft refresh and respects normal git bypass behavior. | ? NEEDS HUMAN | Default fail-soft script/hook wiring, strict-mode opt-in, disabled-mode cleanup, and concise hook output are implemented and covered by tests, but real push latency and `git push --no-verify` still need live verification ([packages/core/src/runtime/local-cli.ts](/Volumes/git/legotin/agent-badge/packages/core/src/runtime/local-cli.ts#L32), [packages/core/src/init/runtime-wiring.test.ts](/Volumes/git/legotin/agent-badge/packages/core/src/init/runtime-wiring.test.ts#L72), [packages/agent-badge/src/commands/refresh.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/refresh.test.ts#L307)). |
| `OPER-02` | `05-02`, `05-03` | `refresh` can recover local badge state end to end without manual file edits. | ✓ SATISFIED | Refresh persists state/cache before publish, supports `--force-full`, and preserves fail-soft recovery state ([packages/agent-badge/src/commands/refresh.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/refresh.ts#L223), [packages/agent-badge/src/commands/refresh.test.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/refresh.test.ts#L138)). |
| `OPER-03` | `05-01`, `05-02` | `status` shows current totals, enabled providers, publish state, and last scan/publish checkpoints. | ✓ SATISFIED | Status formats totals, providers, publish details, last refresh, and checkpoints from persisted files only ([packages/agent-badge/src/commands/status.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/status.ts#L204)). |
| `OPER-04` | `05-02`, `05-03` | `config` lets the developer change enabled providers, badge mode, label, privacy, and refresh behavior after init. | ✓ SATISFIED | Supported keys mutate through validated config changes and `refresh.prePush.*` updates reconcile runtime wiring immediately ([packages/agent-badge/src/commands/config.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts#L172), [packages/agent-badge/src/commands/config.ts](/Volumes/git/legotin/agent-badge/packages/agent-badge/src/commands/config.ts#L377)). |

No orphaned Phase 05 requirements were found: the Phase 05 plans claim all six expected requirement IDs.

### Anti-Patterns Found

No blocker or warning anti-patterns were found in the Phase 05 key files. Targeted scans found no TODO/FIXME/placeholder text and no log-only implementations in the re-verified artifacts.

### Human Verification Required

### 1. Managed Pre-Push Latency and Git Bypass

**Test:** In a real repository initialized with `agent-badge` and non-trivial `~/.codex` / `~/.claude` histories, run a normal `git push`-equivalent hook path, then run `git push --no-verify`.
**Expected:** Default hook remains failure-soft, does not noticeably delay a normal push, and `git push --no-verify` skips the hook entirely.
**Why human:** This depends on real Git hook execution, live provider data size, and operator-perceived latency rather than just unit/integration behavior.

### Gaps Summary

No code or wiring gaps remain in the Phase 05 implementation. The previous SCAN-04 blocker is closed: Codex incremental scanning now uses a watermark-aware SQL delta query, Claude incremental scanning now reads only changed project JSONL files, and the refresh service preserves incremental mode when provider checkpoints remain valid.

The only remaining verification item is human-only operator validation for real-repo `pre-push` latency and `git push --no-verify` behavior. Because that manual check is still outstanding, this re-verification is `human_needed` rather than `passed`.

## Verification Metadata

**Verification approach:** Goal-backward re-verification focused on the prior SCAN-04 gap, with regression checks on previously passing operator surfaces.
**Must-haves source:** Previous `05-VERIFICATION.md` truths plus Phase 05 plan frontmatter and roadmap success criteria
**Automated checks:** 9 passed, 0 failed
**Human checks required:** 1

---
_Verified: 2026-03-30T19:26:03Z_
_Verifier: Claude (gsd-verifier)_
