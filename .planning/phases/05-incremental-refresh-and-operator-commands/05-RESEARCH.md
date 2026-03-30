# Phase 5 Research: Incremental Refresh and Operator Commands

**Phase:** 5
**Goal:** Make day-to-day badge maintenance fast, transparent, and low-friction.
**Requirements:** SCAN-04, PUBL-05, OPER-01, OPER-02, OPER-03, OPER-04
**Researched:** 2026-03-30
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCAN-04 | `refresh` performs incremental scanning using persisted checkpoints instead of a full historical rescan. | Current state already has per-provider `cursor` and `lastScannedAt` fields, and `applyCompletedScanState()` preserves cursors until a real value is supplied. Phase 5 can add a real incremental contract at the provider/service boundary without rewriting Phase 3 persistence semantics. |
| PUBL-05 | Publish skips remote updates when the visible badge value has not changed. | Phase 4 already persists `state.publish.lastPublishedHash` from the exact serialized badge JSON. Phase 5 can reuse the same payload builder and skip the remote write when the newly computed hash matches the stored hash. |
| OPER-01 | Default `pre-push` integration runs a fast failure-soft refresh and respects normal git bypass behavior. | Phase 1 already installs a managed `.git/hooks/pre-push` block that runs `agent-badge refresh --hook pre-push --fail-soft || true`. Phase 5 must implement that command contract rather than changing the hook string. |
| OPER-02 | `refresh` can recover local badge state end to end without manual file edits. | `scan` and `publish` already know how to read config/state, compute attribution, and persist state. Phase 5 can compose those existing pieces into one refresh flow that updates checkpoints, publish state, and operator-visible summaries together. |
| OPER-03 | `status` shows current totals, enabled providers, publish state, and last scan/publish checkpoints. | Current config/state expose providers, publish config, `publish.status`, `lastPublishedHash`, and provider checkpoints, but they do not persist last known aggregate totals. Phase 5 needs one small aggregate snapshot in state or a deterministic refresh/status pipeline that can compute it cheaply. |
| OPER-04 | `config` lets the developer change enabled providers, badge mode, label, privacy, and refresh behavior after init. | Config schema already has provider toggles, `badge.label`, `badge.mode`, `refresh.prePush.enabled`, `refresh.prePush.mode`, and `privacy.aggregateOnly`. Phase 5 needs a safe operator UX over those fields and must resolve the tension between a mutable "privacy" command surface and the product constraint that aggregate-only publishing cannot be disabled. |

</phase_requirements>

## Planning Question

What needs to be true for Phase 5 to add a real incremental refresh path and operator commands on top of the existing scan/publish foundation without inventing the wrong cursor contract, skipping publishes incorrectly, or weakening the privacy-safe hook/setup story already established in earlier phases?

## Repo Reality

- The current runtime is still historical by default:
  - `packages/core/src/scan/full-backfill.ts` always scans every enabled provider.
  - `packages/agent-badge/src/commands/scan.ts` and `packages/agent-badge/src/commands/publish.ts` always call `runFullBackfillScan()`.
- The current state model has just enough checkpoint surface to support Phase 5, but not the behavior:
  - `packages/core/src/state/state-schema.ts` stores `checkpoints.<provider>.cursor` and `lastScannedAt`.
  - `packages/core/src/scan/scan-state.ts` already applies provider cursors only when the scan returns concrete values.
- The publish side is ready for diff-aware skipping:
  - `packages/core/src/publish/publish-service.ts` computes the exact serialized endpoint JSON and persists a SHA-256 hash in `state.publish.lastPublishedHash`.
  - Current `publishBadgeToGist()` always updates the Gist file even when the payload is unchanged.
- The runtime hook contract is already fixed and tested:
  - `packages/core/src/runtime/local-cli.ts` returns the exact refresh hook command `agent-badge refresh --hook pre-push --fail-soft`.
  - `packages/core/src/init/runtime-wiring.ts` writes that command into the managed `pre-push` block and appends `|| true`.
  - Changing the hook string in Phase 5 would create avoidable churn across init/runtime tests and break the idempotent wiring story.
- The CLI command surface is incomplete:
  - `packages/agent-badge/src/cli/main.ts` only registers `init`, `scan`, and `publish`.
  - `refresh`, `status`, and `config` do not exist yet.
- Provider adapters do not yet expose incremental watermarks:
  - `packages/core/src/providers/codex/codex-adapter.ts` loads all thread rows from the newest `state_*.sqlite`.
  - `packages/core/src/providers/claude/claude-adapter.ts` loads every Claude project `.jsonl` file.
  - Neither adapter returns a cursor or accepts a checkpoint today.
- Status is underspecified by current persistence:
  - No state field stores the latest included session/token totals, ambiguous count, or excluded count.
  - A fast `status` command therefore needs either a small aggregate snapshot in state or a well-defined cheap refresh/read path.
- `config` has a product-level tension to resolve:
  - The schema currently hard-locks `privacy.aggregateOnly` to `true`.
  - The product constraints say raw data must never leave the machine.
  - OPER-04 still expects a privacy control after init, so the plan must explicitly decide whether privacy means a local-output setting, a constrained future-proof field, or a read/reject UX for unsupported unsafe changes.
- There is no `05-CONTEXT.md`, so planning must derive behavior from roadmap requirements, prior phase decisions, and the current codebase.

## Phase Boundary

### In Scope

- One incremental scan service boundary that can reuse existing attribution logic and state-write semantics.
- Diff-aware publish decisions based on the exact badge payload that would be uploaded.
- New `refresh`, `status`, and `config` command flows.
- A real Phase 5 implementation of the already-installed failure-soft `pre-push` contract.
- Small aggregate-only state additions needed to support fast operator UX.
- Tests that prove failure-soft behavior, checkpoint advancement, status visibility, and config mutations.

### Explicitly Out of Scope

- New provider data sources or a second local database for scan state.
- Any remote publish format change beyond skip-on-no-change behavior.
- `doctor`, `uninstall`, log rotation, or privacy audits of logs and remote payloads. Those belong to Phase 6.
- Live Codex/Claude hooks or background daemons. Those are v2 ideas.
- Any ability to disable aggregate-only publishing or upload raw transcripts, filenames, or absolute paths.

## Recommended Delivery Shape

Keep the roadmap's three-plan split. The dependency chain should stay linear even if some tasks inside a plan can run in parallel.

### 05-01: Implement incremental checkpoints and diff-aware publish decisions

Own the phase contract first: what a provider checkpoint means, how refresh decides what changed, and when publish is allowed to skip.

- Add an incremental scan service instead of teaching command handlers provider-specific logic.
- Extend provider adapters or a scan-layer wrapper so each enabled provider can:
  - accept a prior opaque cursor
  - return newly discovered sessions for this refresh
  - return a next concrete cursor only after successful scan completion
- Keep the checkpoint contract provider-owned and opaque:
  - Codex likely needs a cursor tied to the newest SQLite database plus a high-water mark from thread timestamps or ids.
  - Claude likely needs a cursor that can distinguish already-read JSONL content from appended/new session content.
  - Do not reduce this to only `lastScannedAt`; that is too weak for correctness.
- Reuse the current badge payload builder and skip the Gist update when the newly serialized payload hashes to the existing `lastPublishedHash`.
- Preserve the existing Phase 4 rule that config and state are the only persisted badge/publish bookkeeping; do not create a side database.

**Why first:** every later command depends on one trustworthy incremental refresh contract and one trustworthy publish-skip rule.

### 05-02: Build `refresh`, `status`, and `config` command flows on top of shared services

Own the operator interface second, after the underlying refresh/publish semantics are stable.

- Create a shared refresh orchestration path that:
  - loads config/state
  - runs incremental scan for enabled providers
  - re-runs attribution with existing override semantics
  - advances checkpoints only for successfully scanned providers
  - decides whether publish is configured and whether the badge JSON changed
  - persists a small aggregate-only summary for later status output
- Add `refresh` command modes that preserve the existing hook contract:
  - normal CLI use
  - `--hook pre-push`
  - `--fail-soft`
- Add a `status` command that reads only config/state and prints:
  - included totals and relevant aggregate counts
  - enabled/disabled provider status
  - publish target state and last publish status/hash metadata
  - provider checkpoint timestamps/cursors in an operator-appropriate, privacy-safe form
- Add a `config` command with explicit mutation rules:
  - providers enabled/disabled
  - badge label/mode
  - refresh pre-push settings
  - privacy behavior only if it stays within aggregate-only constraints
- Prefer small core helpers for read/modify/write config/state so the CLI stays thin and testable.

**Why second:** operator commands should depend on finished refresh semantics, not define them ad hoc in separate handlers.

### 05-03: Install and validate the lightweight failure-soft `pre-push` integration

Own the phase’s workflow outcome last: fast day-to-day automation that does not block normal git usage by default.

- Reuse the existing managed hook markers and command string from Phase 1.
- Teach `refresh` to detect hook mode and print shorter, action-oriented output suitable for `pre-push`.
- Ensure the hook path remains failure-soft even when:
  - provider data is unreadable
  - publish is deferred
  - auth is missing
  - no visible badge change occurred
- Decide whether config changes should update or preserve the installed hook block:
  - if `refresh.prePush.enabled` becomes `false`, runtime wiring likely needs a reconciliation helper rather than a one-time writer
  - if `refresh.prePush.mode` changes between `fail-soft` and `strict`, the hook block and/or invoked command must stay aligned with config without duplicating markers
- Add integration coverage proving that a configured repo with the managed hook runs the refresh path and preserves normal bypass behavior.

**Why third:** the hook is only correct once the refresh command and config-driven behavior already exist.

## State and Service Guidance

### Incremental scan contract

Recommended shape:

- Keep `runFullBackfillScan()` as the historical/bootstrap path.
- Add a new scan-layer service for Phase 5, for example `runIncrementalRefreshScan()`, that can:
  - read prior provider cursors from state
  - ask each provider for only new or changed sessions
  - merge or dedupe those sessions against any persisted aggregate snapshot needed for status/publish
  - return `providerCursors` only on success

This avoids overloading `scan.ts` or `publish.ts` with provider-specific logic and keeps full backfill available for init or recovery.

### Aggregate snapshot for status

Phase 5 likely needs one small persisted refresh summary in state or a sibling aggregate-only file inside `.agent-badge/`.

Minimum useful fields:

- included session total
- included token total
- ambiguous count
- excluded count
- last refresh timestamp
- whether the last refresh skipped publish or performed publish

Without this, `status` either becomes slow by recomputing every time or weak by omitting the totals the requirement explicitly asks for.

### Publish skip rule

Use the exact serialized endpoint payload hash as the skip predicate.

Why this is the right rule:

- It respects badge mode and label changes, not just total changes.
- It matches the user-visible badge payload, which is what PUBL-05 actually cares about.
- It reuses Phase 4's existing `lastPublishedHash` contract instead of inventing a second comparison field.

### Config mutation boundary

The planner must resolve the "privacy" requirement explicitly instead of hand-waving it.

Safe options:

1. Keep `privacy.aggregateOnly` immutable and make `config` reject unsafe mutations with a precise message.
2. Introduce a new privacy-related local-output setting that does not affect remote aggregate-only publishing.

Unsafe option:

- any setting that would allow transcripts, filenames, or local paths to leave the machine

## Validation Architecture

Phase 5 should stay heavily automated with fixtures, mocked provider adapters, and temp repos. No live network or real home-directory reads should be required in tests.

### Required automated coverage

- Incremental scan tests:
  - provider cursors are consumed and advanced only after successful provider scans
  - refresh does not fall back to full backfill once valid checkpoints exist
  - failed provider scans preserve prior cursors and do not partially corrupt state
- Publish skip tests:
  - identical endpoint payload hashes skip remote writes
  - label/mode changes force a publish even when included totals are unchanged
  - changed included totals force a publish and update `lastPublishedHash`
- Command tests:
  - `refresh`, `status`, and `config` commands are registered in `packages/agent-badge/src/cli/main.ts`
  - `refresh` updates state end to end without manual file edits
  - `status` prints enabled providers, publish state, totals, and checkpoint timing
  - `config` persists supported mutations and rejects unsupported unsafe changes clearly
- Hook/runtime tests:
  - managed `pre-push` execution remains failure-soft by default
  - disabled or strict-mode config changes reconcile the hook behavior intentionally
  - hook output stays concise enough for normal git usage

### Recommended commands

- Quick targeted runs:
  - `npm test -- --run packages/core/src/scan`
  - `npm test -- --run packages/core/src/publish`
  - `npm test -- --run packages/agent-badge/src/commands`
- Full suite:
  - `npm test -- --run`

## Concrete Extension Points

Recommended new modules:

```text
packages/core/src/scan/incremental-refresh.ts
packages/core/src/scan/provider-checkpoints.ts
packages/core/src/operations/refresh-summary.ts
packages/agent-badge/src/commands/refresh.ts
packages/agent-badge/src/commands/status.ts
packages/agent-badge/src/commands/config.ts
```

Existing files likely to change:

- `packages/core/src/providers/codex/codex-adapter.ts`
- `packages/core/src/providers/claude/claude-adapter.ts`
- `packages/core/src/scan/full-backfill.ts`
- `packages/core/src/scan/scan-state.ts`
- `packages/core/src/state/state-schema.ts`
- `packages/core/src/config/config-schema.ts`
- `packages/core/src/publish/publish-service.ts`
- `packages/core/src/init/runtime-wiring.ts`
- `packages/core/src/runtime/local-cli.ts`
- `packages/agent-badge/src/cli/main.ts`

Existing files to treat as reference implementations:

- `packages/agent-badge/src/commands/scan.ts`
- `packages/agent-badge/src/commands/publish.ts`
- `packages/agent-badge/src/commands/init.ts`
- `packages/core/src/publish/publish-target.ts`
- `packages/core/src/publish/publish-state.ts`
- `packages/core/src/init/runtime-wiring.ts`

## Do Not Build the Wrong Thing

- Do not encode fake cursors just to populate `state.checkpoints.*.cursor`.
- Do not compare only included totals for PUBL-05 when the actual visible payload can also change through label or mode.
- Do not change the managed hook command string unless the plan also updates every runtime-wiring expectation and idempotency guarantee.
- Do not make `status` depend on network access or a full historical rescan.
- Do not let `config` weaken the aggregate-only privacy model.
- Do not push provider-specific incremental rules into CLI command handlers.

## Risks to Carry Into Planning

### Risk 1: Provider cursors are harder than the current state shape suggests

The state field is only a nullable string, but Codex and Claude may each need composite watermarks. Plans should treat the cursor as an opaque serialized provider contract rather than a simple timestamp.

### Risk 2: `status` can become accidentally expensive

If the phase does not persist a small aggregate summary, `status` may end up rerunning refresh logic too often or showing incomplete information.

### Risk 3: Publish skipping can undercount visible changes

If the implementation compares totals only, badge label/mode changes will not republish even though the rendered badge changed.

### Risk 4: Hook behavior can drift from config behavior

The repo already writes a concrete `pre-push` command during init. Phase 5 must decide how later config mutations reconcile with that installed hook block.

### Risk 5: OPER-04 can create an unsafe privacy loophole

The requirement expects privacy configuration, but the product constraints forbid disabling aggregate-only publishing. The plans need an explicit safe interpretation instead of silently implementing a broader option surface.

## Sources

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/PROJECT.md`
- `packages/core/src/state/state-schema.ts`
- `packages/core/src/scan/scan-state.ts`
- `packages/core/src/scan/full-backfill.ts`
- `packages/core/src/providers/codex/codex-adapter.ts`
- `packages/core/src/providers/codex/codex-sql.ts`
- `packages/core/src/providers/claude/claude-adapter.ts`
- `packages/core/src/providers/claude/claude-jsonl.ts`
- `packages/core/src/publish/publish-service.ts`
- `packages/core/src/publish/publish-state.ts`
- `packages/core/src/publish/publish-target.ts`
- `packages/core/src/config/config-schema.ts`
- `packages/core/src/init/runtime-wiring.ts`
- `packages/core/src/runtime/local-cli.ts`
- `packages/agent-badge/src/commands/scan.ts`
- `packages/agent-badge/src/commands/publish.ts`
- `packages/agent-badge/src/commands/init.ts`
- `packages/agent-badge/src/cli/main.ts`

---
*Phase 5 research synthesized from roadmap, requirements, prior phase decisions, and current repo code*
*Researched: 2026-03-30*
