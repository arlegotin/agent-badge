# Phase 2 Research: Repo Identity and Provider Parsing

**Phase:** 2
**Goal:** Build the normalized repo and provider data model that all attribution logic depends on.
**Requirements:** ATTR-01, SCAN-01, SCAN-02, SCAN-03
**Researched:** 2026-03-30
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ATTR-01 | Tool derives a canonical repo fingerprint from git root, normalized origin URL, repo owner/name when available, and local aliases. | Research defines a dedicated repo-identity service, strict GitHub-style remote normalization, and a privacy-safe alias model. |
| SCAN-01 | Tool detects which provider directories exist and enables only those providers by default. | Research confirms the repo already has an availability-based default-config seam; Phase 2 should preserve it and add explicit coverage. |
| SCAN-02 | Tool can scan Codex local session data under `~/.codex` and compute deduped per-session token totals for the repo. | Research identifies `~/.codex/state_5.sqlite` `threads` as the primary source of truth, `thread_spawn_edges` as lineage data, and `history.jsonl` as fallback-only metadata. |
| SCAN-03 | Tool can scan Claude local data under `~/.claude` and map session metadata into the same normalized session model. | Research identifies project JSONL files as the canonical source, `message.usage` as the trusted usage shape, and repeated `message.id` values as a required dedupe rule. |

</phase_requirements>

## Planning Question

What needs to be true for Phase 2 to establish a trustworthy local repo identity and one provider-neutral session summary model without leaking private data or locking the project into the wrong provider storage assumptions?

## Repo Reality

- Phase 1 already created the right extension points in `packages/core`: git context, provider detection, config/state schemas, init preflight, and fixture helpers.
- The repo is already on Vitest with a root `vitest.config.ts`, root `npm test -- --run`, and temp-home fixture support in `packages/testkit/src/provider-fixtures.ts`.
- `packages/core/src/init/default-config.ts` already applies provider availability to fresh config defaults. SCAN-01 is mostly a coverage and integration-hardening step, not a redesign.
- `.agent-badge/config.json` and `.agent-badge/state.json` are not gitignored, while `.agent-badge/cache/` and `.agent-badge/logs/` are. That makes persisted alias design a privacy and portability concern immediately.
- There is no `CONTEXT.md` for Phase 2, so this research is constrained by `AGENTS.md`, `ROADMAP.md`, `REQUIREMENTS.md`, the current codebase, and direct inspection of local provider artifacts on this machine.

## Phase Boundary

### In Scope

- Define a canonical repo fingerprint service and a privacy-safe config shape for aliases.
- Normalize git remotes into one stable repo slug when origin data exists.
- Introduce a provider-agnostic normalized session summary model in `packages/core`.
- Implement a Codex adapter from the authoritative local Codex artifact.
- Implement a Claude adapter from the authoritative local Claude artifact.
- Preserve enough repo/session evidence for Phase 3 attribution without persisting raw provider payloads.
- Add fixture-backed tests that prove the parsing rules and privacy boundaries.

### Explicitly Out of Scope

- Historical backfill orchestration and attribution scoring.
- Ambiguity handling, override persistence, or attribution reports.
- Publish behavior, README mutation, refresh/status/config/doctor/uninstall UX.
- Final policy on Codex parent/subagent roll-up. Phase 2 should preserve lineage, not settle accounting semantics prematurely.

## Recommended Delivery Shape

Keep the roadmap's three-plan split. It matches the real code seams.

### 02-01: Repo Fingerprint, Remote Normalization, and Alias-Aware Identity

Own the canonical repo model.

- Extend `packages/core/src/repo` with a dedicated identity service rather than overloading `getGitContext()`.
- Add strict GitHub-style remote normalization and canonical slug helpers.
- Extend config defaults/schema with privacy-safe repo aliases.
- Add unit tests for remote normalization, alias handling, and no-origin repos.

**Why first:** Both provider adapters need a stable fingerprint target and alias model before Phase 3 attribution can trust repo matching.

### 02-02: Shared Session Summary Model and Codex Adapter

Own the shared model plus the first provider.

- Add a provider-neutral normalized session summary schema under `packages/core`.
- Add a Codex adapter that reads `~/.codex/state_*.sqlite` as the primary source of truth.
- Preserve `thread_spawn_edges` lineage without deciding aggregation policy yet.
- Add sanitized Codex fixtures and adapter tests.

**Why second:** Codex has the strongest one-row-per-thread source of truth, so it is the right place to lock the shared session model first.

### 02-03: Claude Adapter and Provider-Default Integration Coverage

Own the second provider and the remaining SCAN-01 hardening.

- Add a Claude adapter that reads `~/.claude/projects/**/*.jsonl`.
- Reuse the shared session summary model from `02-02`.
- Add tests proving missing provider homes stay disabled by default and detected homes stay enabled.
- Export the new repo/provider modules from `packages/core/src/index.ts`.

**Why third:** Claude has the trickier per-message dedupe rule, and SCAN-01 naturally closes once both provider adapters are wired into the existing availability-based defaults.

## Canonical Repo Identity

### Primary Recommendation

Use one derived in-memory `RepoFingerprint` object and keep persisted config aliases privacy-safe. Do not persist raw absolute path aliases in `.agent-badge/config.json`.

### Recommended Fingerprint Fields

| Field | Source | Persist? | Notes |
|------|--------|----------|-------|
| `gitRoot` | `git rev-parse --show-toplevel` | No | Runtime-only local evidence. |
| `gitRootBasename` | basename of root | No | Useful no-origin fallback. |
| `originUrlRaw` | `git remote get-url origin` | No | Keep original only in memory. |
| `originUrlNormalized` | remote normalizer | No | Canonical comparison key. |
| `host` | normalized remote | No | `github.com` on the happy path. |
| `owner` | normalized remote path | No | Nullable for no-origin repos. |
| `repo` | normalized remote path or basename fallback | No | Prefer remote-derived when available. |
| `canonicalSlug` | lower-cased `owner/repo` | No | Stable comparison key. |
| `aliases.remoteUrls` | config | Yes | Additional remotes normalized with the same rules as origin. |
| `aliases.slugs` | config | Yes | Additional owner/name pairs for renames, mirrors, or transfers. |

### Recommended Alias Model

Extend config with a repo section shaped like:

```ts
repo: {
  aliases: {
    remotes: string[];
    slugs: string[];
  };
}
```

Use this model because:

- It satisfies ATTR-01 without storing developer-specific absolute paths in committed config.
- It covers the cases that survive across machines: remote renames, owner transfers, mirror remotes, and slug changes.
- Local path evidence can stay runtime-only from provider session summaries.

Do not add persisted alias fields for:

- absolute local roots
- Claude project directory keys
- raw provider cwd snapshots

Those are private, machine-specific, and unnecessary at config level.

### Safe Remote URL Normalization

Normalize GitHub-style remotes with a strict allowlist:

1. Accept raw `origin` values from `git remote get-url origin`.
2. Handle SCP-style SSH (`git@github.com:owner/repo.git`) by rewriting to URL form before parsing.
3. Handle `https://`, `ssh://`, and GitHub-style SSH remotes.
4. Lower-case the host.
5. Strip one trailing `.git`.
6. Strip one trailing slash.
7. For GitHub-like remotes, require exactly two path segments after the host.
8. Compare with a canonical URL form such as `https://github.com/owner/repo`.
9. Store slug comparisons in lower case.

For no-origin repos:

- `originUrlNormalized = null`
- `host = null`
- `owner = null`
- `repo = basename(gitRoot)`
- fingerprint remains valid through git-root evidence only

Do not:

- guess an owner from the local path
- resolve network aliases
- normalize arbitrary multi-segment enterprise paths as if they were GitHub slugs

## Shared Session Summary Model

Define one provider-neutral model now and make Phase 3 consume it unchanged.

Recommended shape:

```ts
interface NormalizedSessionSummary {
  provider: "codex" | "claude";
  providerSessionId: string;
  startedAt: string | null;
  updatedAt: string | null;
  cwd: string | null;
  gitBranch: string | null;
  observedRemoteUrl: string | null;
  observedRemoteUrlNormalized: string | null;
  tokenUsage: {
    total: number;
    input: number | null;
    output: number | null;
    cacheCreation: number | null;
    cacheRead: number | null;
    reasoningOutput: number | null;
  };
  lineage: {
    parentSessionId: string | null;
    kind: "root" | "child" | "unknown";
  };
  metadata: {
    model: string | null;
    modelProvider: string | null;
    sourceKind: string | null;
    cliVersion: string | null;
  };
}
```

The model must carry enough attribution evidence forward for Phase 3, but it must not carry prompts, transcript text, summaries, or file contents.

## Provider Artifact Findings

### Codex local data

Observed on this machine:

- `~/.codex/state_5.sqlite` exists and contains `threads`, `thread_spawn_edges`, and `logs`.
- `threads` contains safe session-summary fields such as:
  - `id`
  - `created_at`
  - `updated_at`
  - `source`
  - `model_provider`
  - `cwd`
  - `tokens_used`
  - `git_sha`
  - `git_branch`
  - `git_origin_url`
  - `cli_version`
  - `agent_nickname`
  - `agent_role`
  - `model`
- `threads` also contains unsafe text fields such as `title` and `first_user_message`.
- `thread_spawn_edges` contains explicit parent/child lineage through `parent_thread_id` and `child_thread_id`.
- `logs` contains raw log text in `message`, which is unsafe for normalized summaries.
- The sampled database currently has `900` rows in `threads` and `84` rows in `thread_spawn_edges`.
- Joining `thread_spawn_edges` to `threads` on this machine shows `84/84` parent threads with `tokens_used >= child.tokens_used`, which means overlap is plausible and roll-up policy should stay deferred to Phase 3.

`~/.codex/history.jsonl` also exists, but sampled entries only contain:

- `session_id`
- `ts`
- `text`

The current file has:

- `2021` rows
- `456` distinct sessions
- `235` duplicated sessions
- up to `217` rows for one session

Planning implication:

- Codex should use `state_*.sqlite` `threads` as the primary source of truth for one normalized summary per thread.
- `history.jsonl` is fallback-only metadata and should never be the primary totals source.
- Phase 2 should preserve `thread_spawn_edges` lineage and raw per-thread totals without deciding parent/child aggregation policy yet.

### Claude local data

Observed on this machine:

- Session files live under `~/.claude/projects/<project-key>/*.jsonl`.
- The repo under study has project-local files under `~/.claude/projects/-Volumes-git-legotin-agent-badge/*.jsonl`.
- One JSONL file corresponds to one `sessionId`.
- Event types in the sampled file include:
  - `user`
  - `assistant`
  - `progress`
  - `file-history-snapshot`
  - `system`
  - `last-prompt`
- The meaningful rows carry `cwd`, `gitBranch`, `sessionId`, and `timestamp`.
- Assistant rows contain `message.usage` with fields such as:
  - `input_tokens`
  - `output_tokens`
  - `cache_creation_input_tokens`
  - `cache_read_input_tokens`
  - `cache_creation`
  - optional operational fields such as `iterations`, `server_tool_use`, `speed`, `service_tier`, and `inference_geo`

Most important parsing fact:

- Assistant messages are repeated across partial/thinking/final rows with the same `message.id`.
- In the sampled project session there were `12` assistant rows but only `6` unique `message.id` values.
- Naively summing all assistant `usage` rows in that sample yields:
  - `input: 22`
  - `cacheCreate: 109884`
  - `cacheRead: 205986`
  - `output: 5102`
- Deduping by `message.id` and keeping only the latest row per message yields:
  - `input: 11`
  - `cacheCreate: 44365`
  - `cacheRead: 114274`
  - `output: 4933`

Optional secondary source:

- `sessions-index.json` exists in only `2` of `8` project directories under `~/.claude/projects` on this machine.
- `7` of those `8` directories contain JSONL session files.
- The current repo's project directory has JSONL files but no `sessions-index.json`.

`~/.claude/history.jsonl` exists, but sampled entries only contain:

- `display`
- `pastedContents`
- `project`
- `sessionId`
- `timestamp`

Planning implication:

- Claude should use project JSONL files as the canonical source.
- `sessions-index.json` is optional and should not be treated as required or canonical.
- `history.jsonl` is useful only for high-level history and should not drive per-session totals.
- The adapter must dedupe by `message.id` and prefer the terminal/latest assistant record before totaling usage.

## Implementation Guidance

### Repo identity and remote normalization

- Keep `packages/core/src/repo/git-context.ts` focused on init/preflight facts.
- Add a separate repo-identity module for canonical fingerprint derivation.
- Use `realpath` for local root comparison so symlinked working trees do not create duplicate identities.
- Keep alias configuration in user config, not derived state.

### Provider defaults

- Keep `detectProviderAvailability()` as the low-level existence probe.
- Keep `createDefaultAgentBadgeConfig()` as the availability-based defaulting seam.
- Add explicit tests for default enablement, but do not silently rewrite a user's saved provider settings on later runs.

### Codex adapter

- Read `~/.codex/state_*.sqlite` as the primary source of truth.
- Select an allowlist of safe columns from `threads`; never `SELECT *`.
- Use `threads.id` as the dedupe key.
- Carry `thread_spawn_edges` lineage into the normalized summary.
- Use `history.jsonl` only as a non-blocking fallback when the DB is unreadable, and even then treat it as partial metadata rather than a totals source.
- Do not read `logs.message`, `threads.title`, or `threads.first_user_message` into normalized outputs.

### Claude adapter

- Walk `~/.claude/projects/**/*.jsonl`.
- Use project JSONL files as the canonical source.
- Aggregate assistant `message.usage` only.
- Dedupe usage by `message.id`, keeping the latest row for each assistant message.
- Ignore `progress`, `file-history-snapshot`, and other non-usage rows for totals.
- Treat `sessions-index.json` and `history.jsonl` as optional debug or future-acceleration inputs, not correctness dependencies.

### Concrete extension points

Phase 2 should extend the current code here:

- `packages/core/src/repo/git-context.ts`
- `packages/core/src/config/config-schema.ts`
- `packages/core/src/init/default-config.ts`
- `packages/core/src/init/provider-detection.ts`
- `packages/core/src/index.ts`
- `packages/testkit/src/provider-fixtures.ts`

Recommended new modules:

```text
packages/core/src/repo/repo-fingerprint.ts
packages/core/src/providers/session-summary.ts
packages/core/src/providers/codex/codex-adapter.ts
packages/core/src/providers/codex/codex-sql.ts
packages/core/src/providers/claude/claude-adapter.ts
packages/core/src/providers/claude/claude-jsonl.ts
packages/testkit/src/codex-fixtures.ts
packages/testkit/src/claude-fixtures.ts
packages/testkit/fixtures/codex/
packages/testkit/fixtures/claude/
```

### Fixture strategy

- Commit tiny sanitized provider fixtures and make tests copy them into temp home directories.
- Codex fixtures should include:
  - one normal root session
  - one no-origin session
  - one parent/child subagent pair
  - optional `history.jsonl` only for fallback-path tests
- Claude fixtures should include:
  - one project directory with one short JSONL session
  - one project directory with multiple sessions
  - one directory with JSONL but no `sessions-index.json`
  - one directory with an index file present, proving the adapter ignores it safely

### Privacy rules

- Treat parsing as field allowlisting, not object mirroring.
- Never persist or emit prompt text, transcript content, summaries, pasted contents, or raw filenames from provider artifacts.
- Replace fixture paths with obvious placeholders like `/repo/main` or `/tmp/fixture-repo`.
- Replace fixture remote URLs with fake public-safe values.
- Do not serialize raw provider payloads into `.agent-badge/state.json`.

## Do Not Build the Wrong Thing

- Do not build Codex totals from `history.jsonl`. Use `state_*.sqlite`.
- Do not build Claude totals from `history.jsonl` or `sessions-index.json`. Use project JSONL files.
- Do not persist local absolute path aliases in committed config.
- Do not `SELECT *` from Codex SQLite tables.
- Do not serialize or snapshot raw provider payloads into `.agent-badge/state.json`.

## Risks to Carry Into Planning

### Risk 1: Privacy regression through over-broad parsing

Both providers store unsafe text next to the fields we need. Phase 2 must use allowlisted parsing only.

### Risk 2: Codex SQLite access strategy

Codex's best source of truth is SQLite. The implementation will likely need a Node SQLite dependency or a deliberate read strategy in `02-02`, and that dependency choice should stay isolated to one plan.

### Risk 3: Codex subagent double counting

`thread_spawn_edges` proves lineage exists, and parent token totals may already subsume child work. Phase 2 should preserve lineage and defer aggregation policy to Phase 3.

### Risk 4: Claude assistant usage double counting

Claude repeats `message.id` across partial/final rows. Missing the dedupe rule will inflate totals immediately.

### Risk 5: No-origin repos

A repo with no `origin` must still produce a stable in-memory fingerprint from git-root evidence. This needs first-class tests in `02-01`.

### Risk 6: Schema drift across CLI versions

Observed formats are strong for this machine, but neither provider storage schema should be treated as frozen. Tests should tolerate additive fields and assert only the allowlisted fields the parser uses.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Phase implementation and tests | Yes | `v22.14.0` | None needed |
| npm | Workspace scripts and dependency install | Yes | `11.6.0` | None needed |
| git | Repo fingerprinting and fixture repos | Yes | `2.49.0` | None needed |
| Codex home data | SCAN-02 research target / live validation | Yes | `codex-cli 0.117.0` | Fixture-backed tests |
| Claude home data | SCAN-03 research target / live validation | Yes | `2.1.87 (Claude Code)` | Fixture-backed tests |
| `sqlite3` CLI | Research-only inspection | Yes | system CLI present | Not required at runtime |

Missing dependencies with no fallback: none for planning on this machine.

Missing dependencies with fallback: live provider homes are available here, but CI should still rely on committed fixtures rather than home-directory access.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ATTR-01 | Canonical repo fingerprint normalizes remotes, supports aliases, and handles no-origin repos | unit | `npm test -- --run packages/core/src/repo/repo-fingerprint.test.ts` | No - Wave 0 |
| SCAN-01 | Missing provider homes stay disabled by default and existing homes stay enabled | unit/integration | `npm test -- --run packages/core/src/init/default-config.test.ts packages/core/src/init/preflight.test.ts` | No / Yes |
| SCAN-02 | Codex adapter emits one normalized summary per thread with safe fields only | integration | `npm test -- --run packages/core/src/providers/codex/codex-adapter.test.ts` | No - Wave 0 |
| SCAN-03 | Claude adapter emits one normalized summary per session JSONL file using deduped assistant usage | integration | `npm test -- --run packages/core/src/providers/claude/claude-adapter.test.ts` | No - Wave 0 |

### Sampling Rate

- Per task commit: `npm test -- --run`
- Per wave merge: `npm test -- --run`
- Phase gate: Full suite green before `$gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/core/src/repo/repo-fingerprint.test.ts` - covers ATTR-01
- [ ] `packages/core/src/init/default-config.test.ts` - locks SCAN-01 defaults explicitly
- [ ] `packages/core/src/providers/codex/codex-adapter.test.ts` - covers SCAN-02
- [ ] `packages/core/src/providers/claude/claude-adapter.test.ts` - covers SCAN-03
- [ ] `packages/testkit/src/codex-fixtures.ts` - copies sanitized SQLite fixtures into temp home roots
- [ ] `packages/testkit/src/claude-fixtures.ts` - copies sanitized JSONL fixture trees into temp home roots
- [ ] Add a deliberate SQLite runtime dependency in `02-02` if the Codex adapter reads SQLite directly from Node

## Sources

### Primary

- `AGENTS.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `packages/core/src/repo/git-context.ts`
- `packages/core/src/init/provider-detection.ts`
- `packages/core/src/init/default-config.ts`
- `packages/core/src/config/config-schema.ts`
- `packages/core/src/state/state-schema.ts`
- `packages/testkit/src/provider-fixtures.ts`
- Observed local Codex artifacts:
  - `~/.codex/state_5.sqlite`
  - `~/.codex/history.jsonl`
- Observed local Claude artifacts:
  - `~/.claude/projects/**/*.jsonl`
  - `~/.claude/history.jsonl`
  - optional `~/.claude/projects/*/sessions-index.json`

### Confidence Breakdown

- Repo identity architecture: HIGH - grounded in existing repo seams and stable git behavior
- Codex parser recommendation: HIGH for source-of-truth selection, MEDIUM for future aggregation semantics
- Claude parser recommendation: HIGH - direct local evidence supports JSONL canonicality and message-level dedupe
- Fixture/privacy guidance: HIGH - driven directly by current repo layout, current provider artifacts, and the product's aggregate-only constraints

## Metadata

**Research date:** 2026-03-30
**Valid until:** Re-check local provider formats if Codex or Claude major versions change
