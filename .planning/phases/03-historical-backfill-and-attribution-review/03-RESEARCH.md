# Phase 3 Research: Historical Backfill and Attribution Review

**Phase:** 3
**Goal:** Turn normalized sessions into trustworthy repository totals and expose ambiguous cases safely.
**Requirements:** ATTR-02, ATTR-03, ATTR-04, ATTR-05, SCAN-05
**Researched:** 2026-03-30
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ATTR-02 | First run performs a full historical backfill across enabled providers before the first badge publish. | The repo already has provider adapters and persisted checkpoint slots, so Phase 3 should add one full-scan orchestration path that scans enabled providers, dedupes by `provider + providerSessionId`, and returns one stable inventory before any publish flow exists. |
| ATTR-03 | Session attribution applies evidence in priority order: exact repo root, exact remote, normalized cwd, transcript correlation, then persisted override. | Phase 2 already provides repo fingerprinting plus normalized `cwd` and remote evidence, but Phase 3 still needs a dedicated attribution engine and one additional local-only transcript-correlation seam because the current normalized summary does not expose it. |
| ATTR-04 | Ambiguous sessions are excluded from totals until the developer explicitly approves or rejects them. | `state.json` already has `overrides.ambiguousSessions`; Phase 3 should classify sessions into included, ambiguous, and excluded buckets and treat ambiguous as zero-contribution until an override exists. |
| ATTR-05 | Attribution overrides are persisted and reused on later scans. | The scaffold/state schema already persists include/exclude overrides; Phase 3 should move override load/apply/write into a dedicated attribution/state service with tests proving stability across repeated scans. |
| SCAN-05 | `scan` reports included totals, ambiguous sessions, and excluded sessions in a human-readable attribution report. | The runtime CLI still exposes only `init`, so Phase 3 must add a real `scan` command, a formatter, and state-aware scan completion behavior. |

</phase_requirements>

## Planning Question

What needs to be true for Phase 3 to turn Phase 2's normalized provider sessions into conservative repo totals, without leaking local transcript details or baking in the wrong long-term incremental-scan design?

## Repo Reality

- Phase 2 already created the core inputs Phase 3 needs:
  - canonical repo fingerprinting in `packages/core/src/repo/repo-fingerprint.ts`
  - provider-neutral `NormalizedSessionSummary` in `packages/core/src/providers/session-summary.ts`
  - Codex and Claude adapters in `packages/core/src/providers/*`
- The persisted state schema already contains:
  - `checkpoints.codex`
  - `checkpoints.claude`
  - `overrides.ambiguousSessions`
- The runtime CLI still only wires `init` in `packages/agent-badge/src/cli/main.ts`, so Phase 3 must add the first real post-init operator command.
- `packages/core/src/providers/claude/claude-jsonl.ts` already knows each session file's `filePath`, but `NormalizedSessionSummary` currently drops that correlation signal.
- Codex lineage is preserved through `thread_spawn_edges`, and Phase 2 explicitly deferred any parent/child roll-up policy.
- There is no `03-CONTEXT.md`, so planning must follow roadmap requirements, repo code, and prior research directly.

## Phase Boundary

### In Scope

- Full historical scan orchestration across enabled providers.
- One attribution engine that ranks evidence and classifies sessions as included, ambiguous, or excluded.
- Override application and persistence for ambiguous sessions.
- Human-readable `scan` output that shows included totals, ambiguous sessions, and excluded sessions.
- Checkpoint-aware state updates only after a successful completed scan.
- Fixture-backed tests for attribution ranking, ambiguity behavior, and scan output.

### Explicitly Out of Scope

- Gist creation, badge JSON publishing, README badge insertion, or publish-time gating.
- Incremental scanning and diff-aware refresh decisions beyond storing enough state to support them later.
- `status`, `config`, `doctor`, or `uninstall` command UX.
- Publishing or logging any local path, transcript text, filenames, or provider raw payloads.
- Inventing speculative Codex parent/child subtraction logic without hard evidence.

## Recommended Delivery Shape

Keep the roadmap's three-plan split. It matches the repo seams cleanly.

### 03-01: Full Backfill Orchestration and Provider-Session Inventory

Own the scan pipeline that turns enabled providers into one deduped candidate set.

- Add a shared scan service under `packages/core/src/scan/` that:
  - loads config/state
  - resolves the current repo fingerprint
  - scans only enabled providers
  - dedupes records by `${provider}:${providerSessionId}`
  - carries forward the evidence fields needed for attribution
- Keep aggregation conservative:
  - one candidate per provider session
  - preserve lineage metadata
  - do not invent parent/child token subtraction rules
- Add an integration test that proves a first-run scan processes both provider adapters and returns stable totals with duplicate provider-session rows collapsed.

**Why first:** ATTR-02 needs a single full-scan entrypoint before attribution/reporting layers can be trusted.

### 03-02: Evidence-Based Attribution, Ambiguity Thresholds, and Override Persistence

Own the decision engine.

- Add dedicated attribution modules under `packages/core/src/attribution/`.
- Convert raw session summaries into attribution decisions with:
  - exact repo-root match
  - exact normalized remote match
  - normalized cwd match
  - transcript correlation
  - persisted override reuse
- Model the result explicitly, for example:
  - `status: "included" | "ambiguous" | "excluded"`
  - `evidence: AttributionEvidence[]`
  - `reason`
  - `matchedRepo`
- Apply overrides only as explicit user decisions for previously ambiguous sessions, and persist only the stable session decision key plus `include` or `exclude`.

**Why second:** Phase 3 credibility comes from conservative evidence ranking, not from the raw scan alone.

### 03-03: Scan Report, CLI Wiring, and Completed-Scan State Updates

Own the operator-facing output and stable writeback behavior.

- Add `packages/agent-badge/src/commands/scan.ts` and wire `scan` into `packages/agent-badge/src/cli/main.ts`.
- Add a formatter that prints:
  - repo identity summary
  - included totals by provider and combined totals
  - ambiguous session table with enough evidence to review locally
  - excluded sessions with exact exclusion reasons
- Update `.agent-badge/state.json` only after a full scan finishes successfully:
  - preserve existing overrides
  - update provider `lastScannedAt`
  - populate checkpoint cursors only if the implementation has a concrete, provider-safe watermark
  - otherwise leave `cursor` null and avoid fake incremental semantics
- Add command tests that prove `scan` is registered and prints the three required result buckets.

**Why third:** SCAN-05 is the first user-visible outcome of Phase 3, and state writes should happen only once the scan/report pipeline is stable.

## Attribution Model Guidance

### Evidence Order

Use deterministic ranking, but keep two ideas separate:

1. **Observed evidence score** for a fresh session.
2. **Explicit override reuse** for a session the user already resolved earlier.

Recommended behavior:

- Fresh scan with no override:
  1. exact repo root
  2. exact normalized remote
  3. normalized cwd
  4. transcript correlation
  5. ambiguous or excluded fallback
- Scan with stored override:
  - first compute the raw evidence result for auditability
  - then apply the persisted decision as the final include/exclude outcome

This satisfies ATTR-03 while still making ATTR-05 useful in repeated scans.

### Transcript-Correlation Gap

The current `NormalizedSessionSummary` shape does not expose transcript-correlation evidence. Phase 3 should add one local-only evidence seam without violating the privacy rules.

Recommended options:

- Add a nullable field such as `transcriptLocator` or `sourceCorrelationKey` to the normalized summary.
- For Claude, derive it from the project/session file path already available in `claude-jsonl.ts`.
- Keep it local-only:
  - allowed in memory
  - allowed in test fixtures
  - not persisted to `.agent-badge/state.json`
  - not printed as a raw absolute path in CLI output
- If a raw path is needed internally, convert it to a redacted display label before formatting output.

Do not try to satisfy transcript correlation by reading or persisting transcript bodies.

### Ambiguity Rules

Recommended rule set:

- `included`:
  - one strong evidence source, or
  - multiple weak sources that converge on the same repo
- `ambiguous`:
  - competing plausible repo matches, or
  - only weak evidence that could belong to nearby repos
- `excluded`:
  - explicit override reject, or
  - clear mismatch to the current repo with no plausible local claim

Ambiguous sessions must contribute:

- `0` to included totals
- `1` to ambiguous counts
- detailed review entries in the scan report

## State and Checkpoint Guidance

Phase 3 should be conservative about writeback semantics.

- Update state only after a successful completed scan.
- Preserve existing `overrides.ambiguousSessions` exactly.
- Update `lastScannedAt` for providers that were actually scanned.
- Do not overwrite provider checkpoint cursors with invented values just to make the field non-null.
- Keep Phase 5 free to define the real incremental watermark contract.

## Validation Architecture

Phase 3 is testable with fixtures plus command-output assertions. Prefer automation for everything except human judgment around how a developer would resolve ambiguous sessions.

### Required automated coverage

- Attribution ranking unit tests:
  - exact root beats remote-only
  - remote beats cwd-only
  - ambiguous sessions remain excluded from totals
  - stored include/exclude overrides are reused on later scans
- Scan orchestration integration tests:
  - scans only enabled providers
  - dedupes duplicate `providerSessionId` rows
  - preserves provider-separated totals
- CLI/report tests:
  - `scan` command is registered
  - output contains included totals, ambiguous sessions, and excluded sessions sections
  - output does not contain raw absolute paths or transcript content
- State update tests:
  - successful scan updates `lastScannedAt`
  - failed scan does not partially rewrite checkpoints
  - override map survives repeated scans unchanged

### Recommended commands

- Quick targeted runs:
  - `npm test -- --run packages/core/src/attribution`
  - `npm test -- --run packages/core/src/scan`
  - `npm test -- --run packages/agent-badge/src/commands/scan.test.ts`
- Full suite:
  - `npm test -- --run`

## Concrete Extension Points

Recommended new modules:

```text
packages/core/src/scan/
packages/core/src/attribution/
packages/agent-badge/src/commands/scan.ts
packages/agent-badge/src/commands/scan.test.ts
```

Existing files likely to change:

- `packages/core/src/providers/session-summary.ts`
- `packages/core/src/index.ts`
- `packages/core/src/state/index.ts`
- `packages/agent-badge/src/cli/main.ts`

Existing files to treat as reference implementations:

- `packages/core/src/repo/repo-fingerprint.ts`
- `packages/core/src/providers/codex/codex-adapter.ts`
- `packages/core/src/providers/claude/claude-adapter.ts`
- `packages/core/src/init/scaffold.ts`
- `packages/agent-badge/src/commands/init.ts`

## Do Not Build the Wrong Thing

- Do not publish or log raw provider payloads, transcript text, filenames, or local absolute paths.
- Do not treat ambiguous sessions as included "for convenience".
- Do not invent durable checkpoint cursors unless the value is actually usable for future incremental scans.
- Do not bury attribution decisions inside command handlers; keep them in core services with tests.
- Do not rely on `history.jsonl` artifacts as the primary backfill source when better provider-specific sources already exist.
- Do not make the scan report depend on network access or publish flows.

## Risks to Carry Into Planning

### Risk 1: Transcript-correlation requirement is underrepresented in the current model

Phase 3 must add one privacy-safe local evidence seam or ATTR-03 will be only partially implemented.

### Risk 2: Codex lineage may tempt speculative de-duplication

The repo has evidence that parent token totals may subsume child work. Phase 3 should preserve lineage and report conservatively, not invent arithmetic without hard tests.

### Risk 3: CLI output can leak local evidence accidentally

Human-readable scan output is required, but raw `cwd` or transcript-path dumps would violate the privacy model. Formatters need explicit redaction rules.

### Risk 4: State writes can get ahead of real incremental semantics

If Phase 3 writes fake cursors now, Phase 5 will inherit the wrong contract. Only persist watermarks that the implementation can actually honor later.

### Risk 5: Ambiguity handling can drift into manual bookkeeping

Phase 3 should surface ambiguous sessions clearly, but the stored decision must remain a small stable include/exclude override map, not a copy of raw session evidence.

---
*Phase 3 research synthesized from roadmap, requirements, Phase 2 artifacts, and current repo code*
*Researched: 2026-03-30*
