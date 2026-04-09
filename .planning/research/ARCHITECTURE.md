# Architecture Research

**Domain:** Local-first repository badge tool with local scanning and remote Gist publishing
**Researched:** 2026-03-29
**Confidence:** HIGH

## Standard Architecture

### System Overview

```text
+-------------------------------------------------------------+
| CLI / Initializer Layer                                     |
|  agent-badge CLI   create-agent-badge initializer           |
+---------------------------+---------------------------------+
                            |
+---------------------------v---------------------------------+
| Application Layer                                           |
|  command handlers  repo context  attribution  badge model   |
|  refresh orchestration  doctor/status  config manager       |
+---------------------------+---------------------------------+
                            |
+---------------------------v---------------------------------+
| Integration Layer                                           |
|  codex adapter  claude adapter  git adapter  gist publisher |
|  hook installer  log writer  checkpoint state               |
+---------------------------+---------------------------------+
                            |
+---------------------------v---------------------------------+
| Local / Remote Data                                          |
|  ~/.codex   ~/.claude   .agent-badge/*   .git   GitHub Gist |
+-------------------------------------------------------------+
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CLI surface | Parse commands and format user-facing output | `commander` subcommands with thin handlers |
| Repo context service | Detect git root, remotes, README, package manager, and canonical fingerprint | Shared service used by `init`, `scan`, `refresh`, and `doctor` |
| Provider adapters | Read provider-specific local artifacts and normalize them into session summaries | One adapter per provider with a shared session schema |
| Attribution engine | Score and decide whether a session belongs to the current repo | Deterministic evidence-based matcher with override support |
| Badge model/publisher | Convert totals into Shields endpoint JSON and update Gist state | Pure formatter plus GitHub API client |
| Derived state/logging | Persist checkpoints, overrides, publish hashes, and summary logs | `.agent-badge/state.json` plus rotating log files |
| Hook manager | Install and validate `pre-push` integration | Direct hook writer or thin hook helper |

## Recommended Project Structure

```text
packages/
|- agent-badge/           # Runtime CLI package
|  |- src/cli/            # Command entrypoints and output formatting
|  |- src/commands/       # init, scan, publish, refresh, doctor, status, config, uninstall
|  `- src/index.ts        # Package entry
|- create-agent-badge/    # npm initializer package
|  |- src/                # Bootstrap flow for existing/new repos
|  `- src/index.ts        # Initializer entry
|- core/                  # Shared domain logic
|  |- src/repo/           # Fingerprinting and repo discovery
|  |- src/scan/           # Scan orchestration and checkpoints
|  |- src/attribution/    # Matching logic and ambiguity review
|  |- src/publish/        # Badge JSON and Gist update flow
|  |- src/config/         # Config/state schemas and loaders
|  `- src/logging/        # Summary logs and rotation
`- testkit/               # Fixtures and helpers for provider/session tests
```

### Structure Rationale

- **`packages/agent-badge/`** keeps user-facing command wiring isolated from core scanning logic.
- **`packages/create-agent-badge/`** allows initializer UX to evolve independently from the runtime package.
- **`packages/core/`** prevents provider parsing, attribution, and publishing logic from being duplicated across entrypoints.
- **`packages/testkit/`** keeps fixture-heavy parser tests reusable and out of the production bundles.

## Architectural Patterns

### Pattern 1: Provider Adapter Pattern

**What:** Each provider parser implements a shared interface that yields normalized session summaries.
**When to use:** Anytime a provider has different on-disk formats or metadata fields.
**Trade-offs:** Slightly more abstraction up front, but much simpler future provider expansion.

**Example:**
```typescript
interface ProviderScanner {
  provider: "codex" | "claude";
  scanSessions(input: ScanInput): Promise<NormalizedSession[]>;
}
```

### Pattern 2: Evidence-Based Attribution

**What:** Match sessions to a repo using ordered evidence such as exact root, normalized remote, cwd, transcript path, then persisted override.
**When to use:** For all historical and incremental scan decisions.
**Trade-offs:** More implementation work than loose path matching, but it keeps totals credible.

**Example:**
```typescript
type AttributionEvidence =
  | "repo-root"
  | "git-remote"
  | "normalized-cwd"
  | "transcript-correlation"
  | "user-override";
```

### Pattern 3: Thin Commands, Stateful Services

**What:** Command handlers orchestrate services but do not contain parsing or publish logic.
**When to use:** Across the entire CLI.
**Trade-offs:** More files, but easier testing and less command-specific drift.

## Data Flow

### Request Flow

```text
User command
    ->
CLI handler
    ->
Repo context + config loader
    ->
Scanner / attribution services
    ->
Badge model
    ->
Publisher or status formatter
```

### State Management

```text
Provider data + repo fingerprint
    -> normalized sessions
    -> attributed totals
    -> derived state checkpoints
    -> badge JSON / logs
```

### Key Data Flows

1. **Init flow:** preflight -> repo fingerprint -> full backfill -> publish -> README insertion -> hook install.
2. **Refresh flow:** load checkpoints -> incremental scan -> recompute totals -> publish only if visible badge changed.
3. **Doctor flow:** inspect repo/provider/auth/hook/badge surfaces -> produce actionable fixes without mutating state unless requested.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k sessions | Full local scan plus JSON state is fine. |
| 1k-100k sessions | Lean harder on checkpoints, per-provider cursors, and deduped session summaries. |
| 100k+ sessions | Consider cache indexes for directory traversal and transcript discovery, but keep local source of truth unchanged. |

### Scaling Priorities

1. **First bottleneck:** repeated full rescans on push - solve with durable incremental checkpoints.
2. **Second bottleneck:** slow provider parsing on large transcript sets - solve with summary extraction and fixture-driven profiling.

## Anti-Patterns

### Anti-Pattern 1: Monolithic Command Files

**What people do:** Put parsing, attribution, publishing, and output formatting in one command module.
**Why it's wrong:** Hard to test and almost guarantees inconsistent behavior between `init`, `scan`, `refresh`, and `doctor`.
**Do this instead:** Keep commands thin and route all logic through shared services.

### Anti-Pattern 2: Treating Hook Events as the Primary Ledger

**What people do:** Depend on live hooks only and ignore historical local data.
**Why it's wrong:** You lose the mandatory backfill story and miss sessions recorded before installation.
**Do this instead:** Scan local directories as the source of truth and treat hook integrations as optional freshness optimizations later.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub Gists | REST API create/update for one deterministic JSON file | Keep file naming stable and payload aggregate-only. |
| Shields endpoint badges | Stable URL referencing remote JSON | README should not change after first insertion. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI -> core services | Direct function calls with typed DTOs | Keep output formatting out of domain logic. |
| provider adapters -> attribution engine | Normalized session summaries | Providers should not know repo-specific rules. |
| attribution -> publisher | Aggregate totals plus badge mode config | Publisher should not depend on raw session content. |

## Sources

- https://docs.github.com/en/rest/gists - Gist integration constraints
- https://shields.io/badges/endpoint-badge - badge rendering contract
- https://developers.openai.com/codex/cli/features/ - Codex local storage direction
- https://developers.openai.com/codex/hooks - future hook integration constraints
- https://code.claude.com/docs/en/statusline - Claude metadata shape for normalization

---
*Architecture research for: local-first repository badge tool*
*Researched: 2026-03-29*
