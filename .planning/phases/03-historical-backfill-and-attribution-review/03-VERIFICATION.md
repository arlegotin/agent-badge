---
phase: 03-historical-backfill-and-attribution-review
verified: 2026-03-30T14:06:40Z
status: passed
score: 9/9 must-haves verified
---

# Phase 03: historical-backfill-and-attribution-review Verification Report

**Phase Goal:** Turn normalized sessions into trustworthy repository totals and expose ambiguous cases safely.
**Verified:** 2026-03-30T14:06:40Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A first-run full backfill scans only enabled providers and produces one deduped candidate per `${provider}:${providerSessionId}` before any publish flow exists. | ✓ VERIFIED | `packages/core/src/scan/full-backfill.ts:74` resolves repo identity once, scans only enabled providers, and dedupes on `${session.provider}:${session.providerSessionId}`; `packages/core/src/scan/full-backfill.test.ts:215` and `:320` cover composite-key dedupe and enabled-provider gating. |
| 2 | Normalized session summaries carry a privacy-safe transcript-correlation hint for later attribution without persisting transcript text or raw absolute transcript paths. | ✓ VERIFIED | `packages/core/src/providers/session-summary.ts:13` restricts hints to `cwdRealPath` and `transcriptProjectKey`; `packages/core/src/providers/claude/claude-jsonl.ts:129` derives `projectKey`; no normalized summary field carries transcript text or transcript file paths. |
| 3 | Backfill preserves provider-separated counts and lineage metadata but does not invent parent-child token subtraction rules. | ✓ VERIFIED | `packages/core/src/scan/full-backfill.ts:23` returns per-provider counts; `packages/core/src/providers/codex/codex-adapter.ts:151` preserves parent/child lineage; no subtraction logic exists in backfill or attribution; `packages/core/src/scan/full-backfill.test.ts:357` checks counts and lineage. |
| 4 | Attribution decisions are deterministic and evaluate repo-root, normalized remote, normalized cwd, transcript correlation, then persisted override reuse. | ✓ VERIFIED | `packages/core/src/attribution/attribution-engine.ts:22` through `:223` implements the ordered evidence checks and appends `user-override` last; `packages/core/src/attribution/attribution-engine.test.ts:104` and `:132` verify precedence. |
| 5 | Ambiguous sessions contribute zero to included totals until an explicit include or exclude override exists. | ✓ VERIFIED | `packages/core/src/attribution/attribution-engine.ts:174` marks weak-only matches ambiguous; `packages/core/src/attribution/attribution-engine.test.ts:161` proves a 900-token ambiguous session does not enter included totals until overridden. |
| 6 | Override persistence reuses the existing `overrides.ambiguousSessions` map and stores only stable session decision keys, not raw evidence or transcript data. | ✓ VERIFIED | `packages/core/src/attribution/override-store.ts:13` reads and `:22` writes `state.overrides.ambiguousSessions`; the stored key is `provider:providerSessionId`; `packages/core/src/attribution/attribution-engine.test.ts:272` verifies no raw cwd or transcript values appear in override keys. |
| 7 | The runtime CLI exposes a real `scan` command that performs the Phase 3 backfill and prints included totals, ambiguous sessions, and excluded sessions. | ✓ VERIFIED | `packages/agent-badge/src/cli/main.ts:24` registers `scan`; `packages/agent-badge/src/commands/scan.ts:147` runs config/state load -> backfill -> attribution -> report -> state write; `packages/agent-badge/src/commands/scan.test.ts:321`, `:342`, and `:364` verify all three report sections. |
| 8 | Completed scans update provider `lastScannedAt` and preserve overrides without writing fake incremental cursors. | ✓ VERIFIED | `packages/core/src/scan/scan-state.ts:20` updates `lastScannedAt` only for scanned providers and preserves cursors unless a concrete string is supplied; `packages/agent-badge/src/commands/scan.ts:184` applies that state only after successful report generation; `packages/agent-badge/src/commands/scan.test.ts:440` verifies failed scans do not rewrite state. |
| 9 | Operator-facing output explains attribution evidence without printing raw absolute paths, transcript content, or other privacy-sensitive values. | ✓ VERIFIED | `packages/core/src/scan/scan-report.ts:98` prints stable session keys, provider names, evidence kinds, and reasons only; `packages/core/src/scan/scan-report.test.ts:200` and `:204` assert local path placeholders are absent from output. |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/core/src/providers/session-summary.ts` | Phase 3 attribution-ready session schema | ✓ VERIFIED | Strict `attributionHints` object exposes only `cwdRealPath` and `transcriptProjectKey`. |
| `packages/core/src/scan/full-backfill.ts` | Historical backfill orchestration entrypoint | ✓ VERIFIED | `runFullBackfillScan()` resolves repo identity, scans enabled providers, realpaths cwd hints, and dedupes by provider-session key. |
| `packages/core/src/scan/full-backfill.test.ts` | ATTR-02 regression coverage | ✓ VERIFIED | Covers dedupe, enabled-provider scanning, per-provider counts, lineage preservation, and transcript-text redaction. |
| `packages/core/src/providers/claude/claude-jsonl.ts` | Privacy-safe transcript project correlation hint | ✓ VERIFIED | Derives `projectKey` from the immediate `.claude/projects` directory name. |
| `packages/core/src/attribution/attribution-engine.ts` | Phase 3 attribution decision engine | ✓ VERIFIED | Produces `included` / `ambiguous` / `excluded` classifications with ordered evidence and override reuse. |
| `packages/core/src/attribution/override-store.ts` | Stable ambiguous-session keying and override application | ✓ VERIFIED | Reads and writes only `provider:providerSessionId` keys inside `overrides.ambiguousSessions`. |
| `packages/core/src/attribution/attribution-engine.test.ts` | ATTR-03/04/05 regression coverage | ✓ VERIFIED | Covers evidence ordering, ambiguity exclusion, override reuse, and privacy-safe keys. |
| `packages/agent-badge/src/commands/scan.ts` | Runtime Phase 3 scan command | ✓ VERIFIED | Reads `.agent-badge/config.json` and `.agent-badge/state.json`, runs the phase pipeline, prints the report, and writes state after success. |
| `packages/core/src/scan/scan-report.ts` | Human-readable attribution report formatter | ✓ VERIFIED | Produces `Included Totals`, `Ambiguous Sessions`, and `Excluded Sessions` with redacted evidence detail. |
| `packages/core/src/scan/scan-state.ts` | Completed-scan state writeback rules | ✓ VERIFIED | Updates scanned providers conservatively and reapplies override actions without inventing cursors. |
| `packages/agent-badge/src/commands/scan.test.ts` | SCAN-05 and override-reuse command coverage | ✓ VERIFIED | Covers report sections, second-run override reuse, failed-scan safety, and CLI option wiring. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/scan/full-backfill.ts` | `packages/core/src/repo/repo-fingerprint.ts` | repo fingerprint resolved once per scan | ✓ VERIFIED | `runFullBackfillScan()` calls `resolveRepoFingerprint()` before provider scans. |
| `packages/core/src/scan/full-backfill.ts` | `packages/core/src/providers/codex/codex-adapter.ts` | enabled-provider Codex scan | ✓ VERIFIED | Gated `scanCodexSessions({ homeRoot })` call present. |
| `packages/core/src/scan/full-backfill.ts` | `packages/core/src/providers/claude/claude-adapter.ts` | enabled-provider Claude scan | ✓ VERIFIED | Gated `scanClaudeSessions({ homeRoot })` call present. |
| `packages/core/src/providers/claude/claude-adapter.ts` | `packages/core/src/providers/claude/claude-jsonl.ts` | project-directory correlation key | ✓ VERIFIED | `scanClaudeSessions()` consumes `session.projectKey` from JSONL sessions. |
| `packages/core/src/attribution/attribution-engine.ts` | `packages/core/src/repo/repo-fingerprint.ts` | repo-root and remote comparison | ✓ VERIFIED | Uses `repo.gitRootRealPath`, `repo.originUrlNormalized`, and alias remotes for matching. |
| `packages/core/src/attribution/attribution-engine.ts` | `packages/core/src/providers/session-summary.ts` | normalized session evidence and attribution hints | ✓ VERIFIED | Uses `attributionHints`, `observedRemoteUrlNormalized`, and cwd-derived evidence from normalized summaries. |
| `packages/core/src/attribution/override-store.ts` | `packages/core/src/state/state-schema.ts` | ambiguous override reuse | ✓ VERIFIED | Manual verification: `override-store.ts` imports `AgentBadgeState` and reads/writes `state.overrides.ambiguousSessions`; `gsd-tools` reported a false negative on the pattern search. |
| `packages/agent-badge/src/commands/scan.ts` | `packages/core/src/scan/full-backfill.ts` | Phase 3 historical scan entrypoint | ✓ VERIFIED | `runScanCommand()` calls `runFullBackfillScan()` directly. |
| `packages/agent-badge/src/commands/scan.ts` | `packages/core/src/attribution/attribution-engine.ts` | repo attribution classification | ✓ VERIFIED | `runScanCommand()` classifies backfill output through `attributeBackfillSessions()`. |
| `packages/agent-badge/src/commands/scan.ts` | `packages/core/src/scan/scan-state.ts` | completed-scan checkpoint updates and override persistence | ✓ VERIFIED | `runScanCommand()` calls `applyCompletedScanState()` after report generation. |
| `packages/core/src/scan/scan-report.ts` | `packages/core/src/attribution/attribution-types.ts` | included/ambiguous/excluded section rendering | ✓ VERIFIED | `formatScanReport()` renders `AttributedSession` status groups into the three required sections. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/core/src/providers/codex/codex-adapter.ts` | `threadRows`, `spawnEdges` | `packages/core/src/providers/codex/codex-sql.ts` SQLite reads from `threads` and `thread_spawn_edges` | Yes | ✓ FLOWING |
| `packages/core/src/providers/claude/claude-adapter.ts` | `sessions` | `packages/core/src/providers/claude/claude-jsonl.ts` reads `.claude/projects/**/*.jsonl` rows from disk | Yes | ✓ FLOWING |
| `packages/core/src/scan/full-backfill.ts` | `scannedSessions`, `dedupedSessions`, `counts` | Provider adapters plus `resolveRepoFingerprint()` | Yes | ✓ FLOWING |
| `packages/core/src/attribution/attribution-engine.ts` | `options.sessions`, `options.overrides` | `runFullBackfillScan().sessions` plus persisted `.agent-badge/state.json` override map | Yes | ✓ FLOWING |
| `packages/agent-badge/src/commands/scan.ts` | `report`, `nextState` | `.agent-badge/config.json` + `.agent-badge/state.json` + backfill + attribution + scan-state | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 03 implementation typechecks cleanly | `PATH=/tmp/agent-badge-deps/node_modules/.bin:$PATH npm run typecheck` | Exited `0` | ✓ PASS |
| Phase 03 backfill, attribution, report, and CLI scan behaviors run green together | `PATH=/tmp/agent-badge-deps/node_modules/.bin:$PATH npm test -- --run packages/core/src/scan/full-backfill.test.ts packages/core/src/attribution/attribution-engine.test.ts packages/core/src/scan/scan-report.test.ts packages/agent-badge/src/commands/scan.test.ts` | `4` files passed, `18` tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `ATTR-02` | `03-01`, `03-03` | First run performs a full historical backfill across enabled providers before the first badge publish. | ✓ SATISFIED | `runFullBackfillScan()` is the shared first-run entrypoint and `runScanCommand()` uses it directly before any Phase 4 publish flow exists. |
| `ATTR-03` | `03-02` | Session attribution applies evidence in priority order: exact repo root, exact remote, normalized cwd, transcript correlation, then persisted override. | ✓ SATISFIED | `attributeBackfillSessions()` implements that priority and unit tests cover repo-root and remote precedence plus override reuse. |
| `ATTR-04` | `03-02` | Ambiguous sessions are excluded from totals until the developer explicitly approves or rejects them. | ✓ SATISFIED | Weak-only matches become `ambiguous`; included totals count only `included` sessions until an override is applied. |
| `ATTR-05` | `03-02`, `03-03` | Attribution overrides are persisted and reused on later scans. | ✓ SATISFIED | `override-store.ts`, `scan-state.ts`, and `scan.test.ts:386` show persisted decisions surviving to later scans. |
| `SCAN-05` | `03-03` | `scan` reports included totals, ambiguous sessions, and excluded sessions in a human-readable attribution report. | ✓ SATISFIED | `formatScanReport()` prints the three required sections; `scan-report.test.ts` and `scan.test.ts` verify the report structure and redaction behavior. |

Orphaned Phase 3 requirements: none.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `packages/core/src/providers/codex/codex-adapter.ts`, `packages/core/src/providers/claude/claude-jsonl.ts` | `32`, `69`, `84`, `100` | Empty fallback returns on missing or unreadable local provider files | ℹ️ Info | These are failure-soft parser fallbacks, not stubs. Real data flow is present through SQLite and JSONL readers when provider data exists. |

### Human Verification Required

None identified for phase-goal verification.

### Gaps Summary

No blocking gaps found. Phase 03 delivers a real full-backfill pipeline, deterministic and conservative attribution, stable override reuse, and a wired `scan` command with privacy-safe report output and conservative state writeback.

---

_Verified: 2026-03-30T14:06:40Z_
_Verifier: Claude (gsd-verifier)_
