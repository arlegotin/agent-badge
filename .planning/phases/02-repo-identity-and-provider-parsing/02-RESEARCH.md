# Phase 2 Research: Repo Identity and Provider Parsing

**Phase:** 2
**Goal:** Build the canonical repo model plus normalized Codex and Claude scanners.
**Requirements:** ATTR-01, SCAN-01, SCAN-02, SCAN-03
**Researched:** 2026-03-30
**Confidence:** MEDIUM-HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ATTR-01 | Tool derives a canonical repo fingerprint from git root, normalized origin URL, repo owner/name when available, and local aliases. | Repo identity service, remote normalization rules, privacy-safe alias model, no-origin fallback guidance. |
| SCAN-01 | Tool detects which provider directories exist and enables only those providers by default. | Existing provider detection/default-config seam is already present; Phase 2 should extend coverage, not rewrite it. |
| SCAN-02 | Tool can scan Codex local session data under `~/.codex` and compute deduped per-session token totals for the repo. | Codex source-of-truth recommendation, SQLite schema findings, dedupe key, subagent lineage handling, fixture plan. |
| SCAN-03 | Tool can scan Claude local data under `~/.claude` and map session metadata into the same normalized session model. | Claude project JSONL source-of-truth recommendation, usage field mapping, optional index handling, fixture plan. |
</phase_requirements>

## Planning Question

What needs to be true for Phase 2 plans to produce a trustworthy repo identity layer and provider-normalized session summaries without leaking private data or locking the project into the wrong storage assumptions?

## Repo Reality

- Phase 1 already created the key seams Phase 2 should extend: [`packages/core/src/repo/git-context.ts`](/Volumes/git/legotin/agent-badge/packages/core/src/repo/git-context.ts), [`packages/core/src/init/provider-detection.ts`](/Volumes/git/legotin/agent-badge/packages/core/src/init/provider-detection.ts), [`packages/core/src/config/config-schema.ts`](/Volumes/git/legotin/agent-badge/packages/core/src/config/config-schema.ts), [`packages/core/src/state/state-schema.ts`](/Volumes/git/legotin/agent-badge/packages/core/src/state/state-schema.ts), and [`packages/testkit/src/provider-fixtures.ts`](/Volumes/git/legotin/agent-badge/packages/testkit/src/provider-fixtures.ts).
- `createDefaultAgentBadgeConfig()` already enables providers from detected home-directory presence. SCAN-01 is mostly a coverage and wiring phase, not a redesign.
- `.agent-badge/config.json` and `.agent-badge/state.json` are not gitignored. Only `.agent-badge/cache/` and `.agent-badge/logs/` are ignored. That makes persisted alias design a privacy and portability concern immediately.
- The repo already has Vitest and fixture helpers. Phase 2 can stay fixture-heavy and offline.

## Phase Boundary

### In Scope

- Add a canonical repo fingerprint service with safe remote normalization and alias handling.
- Define one shared normalized session summary model for both providers.
- Implement Codex parsing from the authoritative local artifact.
- Implement Claude parsing from the authoritative local artifact.
- Extend tests and fixtures so Phase 3 can consume normalized sessions without rediscovering provider formats.

### Explicitly Out of Scope

- Attribution scoring, ambiguity handling, or overrides application beyond carrying raw evidence into the normalized model.
- Publish behavior, README mutation, or any remote writes.
- Incremental checkpoints beyond carrying enough timestamps/IDs for Phase 5 to use later.
- Final policy on Codex parent/subagent aggregation. Phase 2 should preserve lineage, not settle the accounting question prematurely.

## Recommended Delivery Shape

The roadmap split is correct. The executable plan split should be:

### 02-01: Repo Fingerprint, Remote Normalization, and Alias-Aware Identity

Own the repo identity service under `packages/core/src/repo/`. This plan should:

- Extend `git-context` from coarse booleans to a richer read-only git facts helper.
- Add a `repo-fingerprint` module that derives:
  - git root realpath
  - remote URL raw value
  - normalized remote URL
  - host
  - owner
  - repo name
  - canonical slug
  - configured alias sets
- Extend `config-schema.ts` with privacy-safe repo aliases.
- Add unit tests for remote normalization and no-origin repos.

### 02-02: Codex Adapter and Shared Session Summary Model

Own the shared normalized session schema plus the Codex adapter. This plan should:

- Add `packages/core/src/providers/session-summary.ts` or equivalent shared model.
- Add a Codex adapter that reads `~/.codex/state_*.sqlite` as the primary source.
- Preserve subagent lineage from `thread_spawn_edges`.
- Add Codex fixture support in `packages/testkit`.
- Add adapter tests against sanitized SQLite fixtures.

### 02-03: Claude Adapter and Provider-Default Integration Coverage

Own the Claude adapter and finish SCAN-01 coverage. This plan should:

- Add a Claude adapter that reads `~/.claude/projects/**/**/*.jsonl`.
- Ignore optional index files as canonical sources, but tolerate them.
- Reuse the shared session summary schema from `02-02`.
- Add tests proving missing providers stay disabled by default and detected providers stay enabled.
- Export the new provider modules from `packages/core/src/index.ts`.

## Canonical Repo Identity

### Primary Recommendation

Use one derived `RepoFingerprint` object in memory and keep persisted config aliases privacy-safe. Do not persist raw absolute path aliases in `.agent-badge/config.json`.

### Recommended Fingerprint Fields

| Field | Source | Persist? | Notes |
|------|--------|----------|-------|
| `gitRoot` | `git rev-parse --show-toplevel` | No | Runtime-only. Safe for local matching, unsafe for committed config. |
| `gitRootBasename` | basename of root | No | Useful no-origin fallback. |
| `originUrlRaw` | `git remote get-url origin` | No | Keep original only in memory. |
| `originUrlNormalized` | remote normalizer | No | Canonical comparison key. |
| `host` | normalized remote | No | `github.com` on the happy path. |
| `owner` | normalized remote path | No | Present only when remote parses cleanly. |
| `repo` | normalized remote path or basename fallback | No | Prefer remote-derived when available. |
| `canonicalSlug` | lower-cased `owner/repo` | No | Comparison key for aliases and attribution evidence. |
| `aliases.remoteUrls` | config | Yes | Additional remotes, normalized with the same rules as origin. |
| `aliases.slugs` | config | Yes | Additional owner/name pairs for renames, mirrors, or fork transitions. |

### Recommended Alias Model

Extend `config-schema.ts` with a repo section shaped like:

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
- It covers the cases that actually survive across machines: remote renames, owner transfers, mirror remotes, and slug changes.
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
- fingerprint remains valid through `gitRoot` evidence only

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
  };
  lineage: {
    parentSessionId: string | null;
    kind: "root" | "child" | "unknown";
  };
  metadata: {
    model: string | null;
    modelProvider: string | null;
    sourceKind: string | null;
  };
}
```

The model must carry raw attribution evidence forward, but it must not carry prompts, transcript text, summaries, or file contents.

## Codex Findings

### What To Parse

**Primary source (HIGH on this machine):** `~/.codex/state_5.sqlite`

Observed schema on the target machine (`codex-cli 0.117.0`) includes:

- `threads`: `id`, `created_at`, `updated_at`, `source`, `model_provider`, `cwd`, `tokens_used`, `git_sha`, `git_branch`, `git_origin_url`, `cli_version`, `model`, plus unsafe text fields such as `title` and `first_user_message`
- `thread_spawn_edges`: explicit parent/child thread lineage
- `logs`: raw log text fields that should not be used for Phase 2 session summaries

**Fallback-only source (HIGH on this machine):** `~/.codex/history.jsonl`

Observed shape is only:

- `session_id`
- `text`
- `ts`

It is event-like and duplicate-heavy. A sample of 2,016 rows had 455 distinct sessions, 235 duplicated sessions, and up to 217 rows for one session. It is not the right primary source for deduped token totals.

### Codex Parser Recommendation

Use the SQLite `threads` table as the source of truth for one summary per session:

- dedupe key: `threads.id`
- timestamps: `created_at`, `updated_at`
- cwd evidence: `cwd`
- remote evidence: `git_origin_url`
- branch evidence: `git_branch`
- token total: `tokens_used`
- lineage: `thread_spawn_edges`
- source kind: `source`

Use `history.jsonl` only if Phase 2 needs a non-blocking fallback when the DB is unreadable, and even then treat it as partial metadata, not a totals source.

### Codex Privacy Rules

Select an allowlist of safe columns. Do not `SELECT *`.

Never persist or emit:

- `threads.title`
- `threads.first_user_message`
- any `logs.message`
- any `feedback_log_body`
- `history.jsonl.text`

### Codex Risk That Must Shape Planning

Subagent accounting is unresolved. The local DB exposes explicit parent/child edges, and in 82 of 83 sampled edges the parent `tokens_used` was greater than or equal to the child value. That strongly suggests aggregation overlap is possible, but it does not prove the exact accounting semantics. Phase 2 should preserve lineage and raw token totals per thread. Phase 3 should decide how to aggregate them.

## Claude Findings

### What To Parse

**Primary source (HIGH on this machine):** `~/.claude/projects/**/**/*.jsonl`

Observed on the target machine (`Claude Code 2.1.87`):

- each session file is a JSONL event stream
- the repo under study has project-local files under `~/.claude/projects/-Volumes-git-legotin-agent-badge/*.jsonl`
- one file corresponds to one `sessionId`
- event types include `user`, `assistant`, `progress`, `file-history-snapshot`, `system`, and `last-prompt`
- most meaningful rows include `cwd`, `gitBranch`, `sessionId`, `timestamp`
- `assistant` rows contain `message.usage`

Observed `message.usage` keys include:

- `input_tokens`
- `output_tokens`
- `cache_creation_input_tokens`
- `cache_read_input_tokens`
- `cache_creation`
- optional operational fields such as `iterations`, `server_tool_use`, `speed`, `service_tier`, `inference_geo`

**Optional secondary source (MEDIUM on this machine):** `sessions-index.json`

Observed in some project directories but not in the current repo’s project directory:

- top-level keys: `version`, `originalPath`, `entries`
- entry keys: `sessionId`, `projectPath`, `fullPath`, `created`, `modified`, `messageCount`, `gitBranch`, `summary`, `firstPrompt`, `isSidechain`

Because the index is absent for the current repo and contains unsafe text fields, it should not be the canonical source.

**Fallback-only source (LOW-MEDIUM):** `~/.claude/history.jsonl`

Observed shape is only:

- `display`
- `pastedContents`
- `project`
- `sessionId`
- `timestamp`

That is useful for high-level history, not trusted per-session totals.

### Claude Parser Recommendation

Use project JSONL files as the canonical source:

- dedupe key: `sessionId`
- timestamps: first and last event timestamps
- cwd evidence: most recent non-empty `cwd`
- branch evidence: most recent non-empty `gitBranch`
- token totals: sum assistant `message.usage`
- total token formula for normalized summaries: `input + output + cache_creation_input_tokens + cache_read_input_tokens`

Ignore as non-canonical:

- `sessions-index.json` for correctness
- `history.jsonl` for totals

Keep those files only as optional debug aids or future acceleration inputs.

### Claude Privacy Rules

The parser must stream and discard content fields. Never persist:

- `message.content`
- `summary`
- `firstPrompt`
- `display`
- `pastedContents`

### Claude Risk That Must Shape Planning

The current repo proves `sessions-index.json` is optional. Seven project directories had JSONL files, but only two had `sessions-index.json`. A plan that depends on the index will be brittle immediately.

## Concrete Extension Points

Phase 2 should extend the current code here:

- [`packages/core/src/repo/git-context.ts`](/Volumes/git/legotin/agent-badge/packages/core/src/repo/git-context.ts): keep read-only git inspection here; add richer repo facts nearby, not inside `init/`
- [`packages/core/src/config/config-schema.ts`](/Volumes/git/legotin/agent-badge/packages/core/src/config/config-schema.ts): add `repo.aliases`
- [`packages/core/src/init/default-config.ts`](/Volumes/git/legotin/agent-badge/packages/core/src/init/default-config.ts): preserve provider default behavior and adjust only if new config fields need defaults
- [`packages/core/src/init/provider-detection.ts`](/Volumes/git/legotin/agent-badge/packages/core/src/init/provider-detection.ts): keep availability-only semantics
- [`packages/core/src/index.ts`](/Volumes/git/legotin/agent-badge/packages/core/src/index.ts): export new repo/provider modules
- [`packages/testkit/src/provider-fixtures.ts`](/Volumes/git/legotin/agent-badge/packages/testkit/src/provider-fixtures.ts): extend or complement with richer seeded provider fixtures

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

## Do Not Build the Wrong Thing

- Do not build Codex totals from `history.jsonl`. Use `state_*.sqlite`.
- Do not build Claude totals from `history.jsonl` or `sessions-index.json`. Use project JSONL files.
- Do not persist local absolute path aliases in committed config.
- Do not `SELECT *` from Codex SQLite tables.
- Do not serialize or snapshot raw provider payloads into `.agent-badge/state.json`.

## Fixture and Privacy Strategy

### Primary Recommendation

Commit tiny sanitized provider fixtures and make tests copy them into temp home directories.

### Codex Fixture Shape

- a minimal `state.sqlite` fixture with:
  - one normal root session
  - one no-origin session
  - one parent/child subagent pair
- optional matching `history.jsonl` fixture only for fallback-path tests
- optional `version.json` fixture

### Claude Fixture Shape

- one project directory with one short JSONL session
- one project directory with multiple sessions
- one directory with JSONL but no `sessions-index.json`
- one directory with an index file present, to prove the adapter ignores it safely

### Privacy Rules For Fixtures

- replace all paths with obvious placeholders like `/repo/main` or `/tmp/fixture-repo`
- replace remote URLs with fake public-safe values
- replace all transcript content with inert placeholders
- never include real prompts, filenames, pasted content, summaries, or branch names from a live machine

## Risks to Carry Into Planning

### Risk 1: Privacy regression through over-broad parsing

Both providers store unsafe text near the useful metadata. The Phase 2 plan must treat parsing as field allowlisting, not object mirroring.

### Risk 2: Codex SQLite access strategy

The Codex source of truth is SQLite. The implementation likely needs a Node SQLite dependency in `02-02`. That is the main new tooling risk in this phase and should be isolated to one plan with install/test coverage.

### Risk 3: Subagent double counting

Codex lineage exists explicitly, but aggregation semantics are not proven. The planner should keep Phase 2 on normalization and defer roll-up policy to Phase 3.

### Risk 4: No-origin repos

A repo with no `origin` must still produce a stable in-memory fingerprint from git root evidence. The planner should make this a first-class test case in `02-01`.

### Risk 5: Schema drift across CLI versions

Observed formats are strong for the target machine, but neither provider storage schema should be treated as frozen. Tests should tolerate additive fields and assert only the allowlisted fields the parser uses.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Phase implementation and tests | ✓ | `v22.14.0` | — |
| npm | Workspace scripts and future dependency install | ✓ | `11.6.0` | — |
| git | Repo fingerprinting and test fixtures | ✓ | `2.49.0` | — |
| Codex home data | SCAN-02 research target / live validation | ✓ | `codex-cli 0.117.0` | fixture-backed tests |
| Claude home data | SCAN-03 research target / live validation | ✓ | `Claude Code 2.1.87` | fixture-backed tests |
| `sqlite3` CLI | Research-only inspection | ✓ | system CLI present | not required at runtime |

**Missing dependencies with no fallback:**

- None on this machine for planning research. The likely implementation dependency is a Node SQLite package, which Phase `02-02` should add deliberately.

**Missing dependencies with fallback:**

- Live provider homes are available here, but CI should still rely on committed fixtures rather than home-directory access.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ATTR-01 | Canonical repo fingerprint normalizes remotes, supports aliases, and handles no-origin repos | unit | `npm test -- --run packages/core/src/repo/repo-fingerprint.test.ts` | ❌ Wave 0 |
| SCAN-01 | Missing provider homes stay disabled by default; existing homes stay enabled | unit/integration | `npm test -- --run packages/core/src/init/default-config.test.ts packages/core/src/init/preflight.test.ts` | ❌ / ✅ |
| SCAN-02 | Codex adapter emits one normalized summary per thread with safe fields only | integration | `npm test -- --run packages/core/src/providers/codex/codex-adapter.test.ts` | ❌ Wave 0 |
| SCAN-03 | Claude adapter emits one normalized summary per session JSONL file with summed usage tokens | integration | `npm test -- --run packages/core/src/providers/claude/claude-adapter.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/core/src/repo/repo-fingerprint.test.ts` — covers ATTR-01
- [ ] `packages/core/src/init/default-config.test.ts` — locks SCAN-01 defaults explicitly
- [ ] `packages/core/src/providers/codex/codex-adapter.test.ts` — covers SCAN-02
- [ ] `packages/core/src/providers/claude/claude-adapter.test.ts` — covers SCAN-03
- [ ] `packages/testkit/src/codex-fixtures.ts` — copies sanitized SQLite fixtures into temp home roots
- [ ] `packages/testkit/src/claude-fixtures.ts` — copies sanitized JSONL fixture trees into temp home roots
- [ ] Add a deliberate SQLite runtime dependency in `02-02` if the Codex adapter reads SQLite directly from Node

## Sources

### Primary

- OpenAI Codex config reference: https://developers.openai.com/codex/config-reference
- GitHub remote URL documentation: https://docs.github.com/en/get-started/git-basics/about-remote-repositories
- Anthropic Claude Code hooks reference: https://docs.anthropic.com/en/docs/claude-code/hooks
- Anthropic prompt caching usage fields: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Anthropic API service tier/usage object docs: https://docs.anthropic.com/en/api/service-tiers
- Local artifact inspection on the target machine:
  - `~/.codex/state_5.sqlite` schema and sample aggregates
  - `~/.codex/history.jsonl` key shapes and duplication profile
  - `~/.claude/projects/-Volumes-git-legotin-agent-badge/*.jsonl` key shapes and usage fields
  - `~/.claude/projects/*/sessions-index.json` optional presence and keys
  - `codex --version` -> `codex-cli 0.117.0`
  - `claude --version` -> `2.1.87 (Claude Code)`

### Secondary

- npm package pages for SQLite bindings considered during planning:
  - https://www.npmjs.com/package/better-sqlite3
  - https://www.npmjs.com/package/sqlite3

## Confidence Breakdown

- **Repo identity architecture:** HIGH
  - Grounded in existing repo seams, git behavior, and stable remote URL formats.
- **Codex parser recommendation:** MEDIUM
  - Strong local evidence for `state_*.sqlite` as the correct source, but aggregation semantics for parent/subagent totals still need implementation-time validation.
- **Claude parser recommendation:** HIGH
  - Strong local evidence that project JSONL is the canonical source and that `sessions-index.json` is optional.
- **Fixture/privacy guidance:** HIGH
  - Driven directly by current repo layout, current provider artifacts, and the project’s aggregate-only constraints.

---
*Research completed: 2026-03-30*
*Ready for planning: yes*
