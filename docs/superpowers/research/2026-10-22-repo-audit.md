# agent-badge audit and current integration research

Date: 2026-10-22. Baseline commit: `d209a47`; published package manifests: `1.1.20`.
Purpose: evidence for a breaking repository-native redesign, not a patch release.

## Executive assessment

The core idea remains sound: local collection, conservative attribution, sanitized
shared data, and a README badge. The current implementation has accumulated extensive
Gist recovery, migration, and global-runtime machinery while its accounting model
has not kept pace with multi-agent sessions, modern storage, and collaboration.

Replacing the destination URL alone would preserve the most consequential defects.
The refactor should replace accounting identities, incremental storage, synchronization,
runtime activation, and release policy together, in independently testable slices.

The recommended design uses a dedicated data branch in the same repository and a
locally generated SVG. This is a design inference from the requirements and Git
constraints, not a platform-prescribed solution. See the complete alternatives and
tradeoffs in the [design](../specs/2026-10-22-repo-native-design.md).

## Audit coverage and baseline

Reviewed the four workspaces, CLI commands, provider readers, attribution, pricing,
refresh caches, Gist publishing/merge logic, setup/uninstall, diagnostics, package
contents, CI/release workflows, smoke scripts, and public documentation. Source
inventory: 130 tracked TypeScript files, comprising 83 source files / 16,166 lines
and 47 test files / 19,971 lines. Counts exclude ignored build artifacts.

The working tree was initially clean on `main`. Created and switched to
`refactor/repo-native-agent-badge`. Dependencies were installed from the existing
lockfile into a temporary source archive, because the repository volume has limited
free space. The validation child processes used an isolated HOME and Git config.
No real user transcripts, agent credentials, or live Gists were read or published.

| Check against original baseline | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| `npm test -- --run` | 47 files, 361 tests pass |
| `npm run docs:check` | Pass |
| Live registry/Gist smoke | Not run; existing scripts can use live credentials |
| New architecture integration/platform tests | Planned; not implemented or claimed passing |

Baseline environment: Node `22.14.0`, npm `11.16.0`, macOS. This is not proof of
Windows/Linux behavior or modern-agent compatibility. Passing tests establish a
useful baseline, while the synthetic reproductions below demonstrate coverage gaps.

After the GSD cleanup, the same typecheck, build, 361 tests, and documentation check
passed again in the isolated copy. Shell syntax checks and both smoke scripts'
`--help` paths passed without invoking their live operations.
`npm run pack:check` and `npm run smoke:pack` also passed with an isolated HOME
and Git configuration. The packed-install check needed public registry access
because offline dependency metadata was not cached; no package was published.
That existing smoke script covers the direct runtime install path, not the proposed
initializer/activation contract.

### Initial Git transport experiment

A disposable local bare remote and two independent clones exercised real Git
`2.49.0` on macOS. Two data commits shared a base: the first push succeeded, the
second rejected as non-fast-forward, and a refetch/rebuild retained both synthetic
observations (100 + 40 tokens). A real pre-push hook then pushed only the data ref
with internal hooks disabled; both that nested push and the outer code push succeeded.
The caller's HEAD, index hash, and worktree status remained unchanged.

This supports the proposed transport mechanics locally. It does not establish
network deadlines, GitHub branch policy/signing compatibility, other platforms,
crash recovery, or hosted image rendering. Task 1 turns the disposable experiment
into maintained regression tests and completes the remaining feasibility gates.

## Reproduced accounting failures

Independent investigation used synthetic provider fixtures in the temporary copy.
The fixtures were removed after execution; these scenarios become required regression
tests in the implementation plan. Numeric examples are synthetic, not user usage.

| Case | Expected | Observed in baseline | Root cause |
| --- | --- | --- | --- |
| Codex committed update remains in open WAL | 1,110 tokens | 999 | Only main SQLite file copied |
| Codex tokens change at same stored timestamp | Updated thread returned | Zero incremental results | Already-seen IDs at timestamp excluded |
| Claude parent 100 + nested child 40 with shared session ID | 140 tokens | 100 | Parent/child stream identity collapses |
| Claude original request 100; fork copies it and adds 50 | 150 tokens | 250 | Cross-transcript inherited request not deduped |
| Claude 100 Sonnet input + 100 Opus input under supplied cards | 1,800 micro-USD | 3,000 | Entire session priced as final model |
| New Claude file with older preserved mtime | New file discovered | Zero incremental results | Global watermark hides imported file |
| Add exclusion to unchanged cached 100-token session | Zero included | 100 included | Only changed sessions reattributed |
| Codex model in tail, usage before last 256 KiB | 125 micro-USD | Zero | Partial tail result stops full fallback |
| Valid JSON `null` line in Claude log | Isolated malformed record | Whole scan throws | Shape not checked before property access |
| No-remote session from sibling worktree / current repo subdirectory | Verified Git membership | Excluded / ambiguous | Filesystem-string evidence, no Git topology |

## Detailed findings

### A. Collection, attribution, and pricing

1. **Live Codex SQLite is not read consistently.**
   `packages/core/src/providers/codex/codex-sql.ts:172` reads the main file into
   sql.js. WAL changes are absent, each query duplicates the whole DB, and thread,
   lineage, and pricing reads can disagree. Database selection at line 222 uses mtime,
   while hardcoded columns/tables can make an otherwise usable source fail completely.
   SQLite explicitly treats WAL as part of the persistent database state.
   [SQLite WAL](https://sqlite.org/wal.html)

2. **Session is too coarse an accounting identity.**
   `claude-jsonl.ts:178` chooses the first row's session ID; `claude-adapter.ts:223`
   labels every stream a root. `scan/full-backfill.ts:116` keeps the first matching
   provider/session pair, while `scan/incremental-refresh.ts:160` replaces by that
   key. Recursive file discovery already exists: the failure is identity and merge
   semantics. Forks also require deduplication across transcripts, not just within
   one file. Keep request, conversation, thread, agent, and inherited origin distinct.

3. **Incremental cursors are unsafe under normal filesystem behavior.**
   `codex-sql.ts:274` truncates timestamps; line 307 excludes known IDs at the
   boundary. `claude-adapter.ts:113,236` uses a global maximum mtime. Neither models
   source generation, imported old files, same-size replacement, or reliable replay
   boundaries. A cursor is only valid when it describes data durably consumed.

4. **Cached attribution and pricing are not invalidated by policy changes.**
   `incremental-refresh.ts:342` evaluates only changed sessions;
   `scan/refresh-cache.ts:11` lacks repository/source/parser/policy/catalog fingerprints.
   Explicit excludes can therefore fail to take effect until a full scan.

5. **Git topology and session context are missing.**
   `attribution/attribution-engine.ts:22` uses path/remote/string comparisons;
   `full-backfill.ts:52` loses realpath evidence when worktrees are removed. Nested
   cwd can be treated as weak even when Git proves membership. Conversely, naive
   path ancestry risks confusing a nested repository with its parent. Slug aliases
   computed in `repo/repo-fingerprint.ts:183` are not used by attribution.

6. **One final model/cwd cannot describe a whole session.**
   `claude-adapter.ts:185,228` sums all usage and chooses latest context/model.
   `pricing/estimate-cost.ts:697,800` applies similar cumulative/final-model logic to
   Codex. Model changes, router providers, and multi-repository work require segments.

7. **Model heuristics can materially misprice usage.**
   `estimate-cost.ts:433` maps broad GPT-5/mini/pro names to old cards; line 467
   conflates Claude variants. Unknown models become zero at line 802. As a specific
   fetched example, its GPT-5.4-mini card is $0.25/$0.025/$2 per million versus
   official $0.75/$0.075/$4.50; Opus 4.6 is mapped to an old $15/$75 card despite
   current standard $5/$25 pricing. These examples explain the failure; do not turn
   this document into the release's pricing catalog.
   [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
   [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)

8. **Partial input is silently treated as zero/empty data.**
   `codex-adapter.ts:233,346` falls back to history records with no usage/evidence
   after diverse SQL errors. `estimate-cost.ts:718,729` accepts model-only tail
   information and stops looking for usage. `claude-jsonl.ts:139` crashes on `null`.
   Missing, unsupported, malformed, partial, zero, and unchanged require distinct
   results; none should silently erase accepted history.

9. **Provider discovery is both hardcoded and frozen too early.**
   `init/provider-detection.ts:26` and readers assume `.codex` / `.claude` under one
   home. `init/default-config.ts:17` persists whichever providers existed during
   setup. This excludes additional profiles and agents installed later or on other
   machines. Repository policy should say `auto`; local source discovery is separate.

10. **“Incremental” still scales with machine-wide history.**
    `claude-jsonl.ts:82,168` enumerates/stats everything and fully reads changed logs
    with unbounded concurrency. Codex repeatedly copies its whole database. Pricing
    has network refresh paths with long timeouts. The hook path needs targeted reads,
    streaming, bounded concurrency, and hard deadlines.

### B. Collaboration and persistence

11. **Repository collaborators do not share Gist ownership.**
    `init/github-auth.ts` discovers personal tokens/gh authentication; `docs/AUTH.md`
    requires access to the configured Gist. Multiple publisher slots cannot give
    repository collaborators permission to update it. GitHub's Gist API describes
    authentication on a user's behalf; it is separate from repository write access.
    [Gist API](https://docs.github.com/en/rest/gists/gists),
    [GitHub CLI editing scope](https://cli.github.com/manual/gh_gist_edit)

12. **Publishing is not an atomic shared-ledger transaction.**
    `publish/publish-service.ts:585` reads a Gist, replaces a contributor snapshot,
    derives shared overrides/totals, and writes them. Concurrent writers can derive
    from stale contributor sets and overwrite shared presentation/controls. Readback
    checks detect some mismatches but are not compare-and-swap serialization. The
    “unchanged badge” path still writes contributor/override files, explaining why
    refresh repeatedly publishes even when the displayed number does not move.

13. **Shared conflict policy can undo an exclusion.**
    `publish/shared-merge.ts:147` accepts an included observation before considering
    another writer's exclusion. `compareSharedObservationWatermark` trusts source
    dates and then larger tokens/costs. Bigger or later is not necessarily corrected
    truth. Replace it with explicit revisions, exclusions, and conflict states.

14. **Local writes are unlocked and non-atomic.**
    `commands/refresh.ts:484` independently writes state and cache; config and scan
    use ordinary `writeFile` too. Concurrent hooks or interruption can lose changes
    or advance checkpoints beyond persisted observations. One storage API must own
    locking, durable journal append, atomic replacement, and recovery.

15. **Default uninstall can expose private state to Git.**
    `commands/uninstall.ts:160` preserves state, while `init/runtime-wiring.ts:745`
    removes its managed ignore entries. A later `git add .` can stage retained
    session/override/checkpoint identifiers. The test at `runtime-wiring.test.ts:521`
    currently expects this removal. Move private state under the Git common directory
    and retain exclusions for legacy files left behind.

### C. Installation, hooks, and CLI

16. **Hook paths do not respect worktrees or hook managers.**
    `runtime-wiring.ts:425,679` and `diagnostics/doctor.ts:984` assume a `.git`
    directory and default hook location. Git supports redirected hooks and shared
    worktree metadata. Resolve all locations through Git.
    [Git hooks](https://git-scm.com/docs/githooks),
    [Git worktrees](https://git-scm.com/docs/git-worktree)

17. **Appending shell text can break existing hooks.**
    `runtime-wiring.ts:229` appends to arbitrary content: an early exit bypasses it,
    non-shell hooks can become invalid, and successful appended commands can hide
    a previous failure. Pre-push stdin must be replayed to independent delegates.
    Fail-soft applies only to agent-badge, never another tool's failure.

18. **Initializer setup is not self-contained.**
    `commands/init.ts:504` only probes global PATH. `runtime/shared-cli.ts:22`
    recommends another global install and probes without a timeout. This contradicts
    the intended single initializer experience. A pinned persistent runtime must be
    installed as part of setup and work in noninteractive hook environments.

19. **Initializer ignores its arguments.**
    `packages/create-agent-badge/src/index.ts:44` invokes init without parsing argv.
    Help/version/unknown flags can execute setup. npm forwards initializer arguments,
    so share the real CLI parser and require side-effect-free informational commands.
    [npm init](https://docs.npmjs.com/cli/v11/commands/npm-init/)

20. **Setup from nested cwd can partly write then fail.**
    `init/preflight.ts:110` retains invocation cwd; scaffold writes there before hook
    installation discovers no local `.git` directory. Canonicalize first and stage a
    setup change plan before mutating owned files.

21. **Doctor tests text, not effective operation.**
    `diagnostics/doctor.ts:1022` checks markers/substrings; `commands/doctor.ts:64`
    does not make failed checks a failing process. It can certify an ignored hook.
    Use actual resolved runtime/hook paths, stable result codes, local freshness,
    pending queue, coverage, and optional bounded remote probes.

22. **Fail-soft is not a latency guarantee.**
    `publish/github-gist-client.ts:162,234` and doctor fetches lack operation deadlines.
    A hook can stall despite eventually returning zero. Budget the entire subprocess
    tree and preserve unfinished work in a durable outbox.

### D. Maintenance and release

23. **Release automation is unsafe for a breaking refactor.**
    `.github/workflows/release.yml:101` publishes before its manual-dispatch branch
    check; cancellation can interrupt publication; only one package's registry version
    is checked. `scripts/release/auto-version.ts:103` always patch-bumps. Version intent,
    exact-tarball checks, serialized publication, and partial-publish recovery must
    replace this path before a `2.0.0` release.
    [Actions concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency),
    [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)

24. **Existing verification encodes implementation rather than outcomes.**
    Package-manager scenarios mostly inspect generated command strings. CI is Ubuntu
    only. The pack smoke installs all packages together and runs initializer `--help`,
    currently a real setup action. Registry smoke can fall back to real gh credentials.
    `scripts/verify-docs.sh:133` enforces Gist/global-runtime phrases rather than
    functional docs correctness. Replace with behavioral fixture pushes, clean install
    resolution, docs links/CLI examples, and platform testing.

25. **Project instructions and old workflow artifacts are stale.**
    The old AGENTS file mandated GSD and described repo-local installation while the
    product actually required a global runtime. Per the user's instruction, replaced
    it with concise Superpowers/project instructions, archived then removed ignored
    `.planning`, and moved the recovery smoke output default to `artifacts/recovery`.
    Existing product docs remain a description of v1 until implementation changes.

26. **License declarations disagree.** Root `LICENSE` contains Apache License 2.0;
    all three publishable package manifests declare MIT. Record the intended license
    and verify packaged LICENSE/metadata before release. This audit does not change
    license terms or infer that either declaration supersedes the other.

## Current agent capability research

Support labels below describe what can be grounded in current primary documentation,
not a claim that this repository already implements it. Freeze fixture-certified
versions during implementation; these interfaces evolve.

| Agent/tool | Primary evidence | Design implication |
| --- | --- | --- |
| Codex config | `CODEX_HOME` relocates configuration/state | Resolve actual roots; support multiple explicit profiles |
| Codex hooks | Common session/cwd/model fields, nullable transcript pointer; separate subagent identity; transcript format unstable | Targeted wakeups, versioned parser, no assumed universal token counter |
| Codex app-server/exec | Stored thread read can avoid resuming; live usage events and owned JSON executions exist; forks have distinct thread lineage | Optional explicit live integrations; never resume sessions for collection; dedupe with backfill |
| Claude hooks | Root and subagent transcript pointers; Agent tool completion usage is only final request | Don't count tool result totals as a whole session; retain child identity |
| Claude monitoring | Usage/cost/request telemetry exists; some transcript joins version-specific | Optional local collection interface; avoid enabling outbound transcript telemetry |
| Gemini CLI | Saved project sessions contain usage; AfterModel schema exposes total tokens | Historical reader plus targeted ingestion; validate dimensional semantics with fixtures |
| OpenCode v2 | Local session export commands; experimental versioned HTTP API with message/usage schemas | Negotiate version; don't reuse old v1 command/schema assumptions blindly |
| Cursor | Hooks expose lifecycle/context; documented context tokens describe context occupancy | Detection alone is not exact usage support; unavailable usage must remain unavailable |
| Copilot | CLI/cloud hooks; organization/enterprise reports with distinct reporting granularity and permissions | Avoid treating org totals or PR activity as repository-local token receipts |

Official sources fetched during the investigation:

- [Codex configuration and state locations](https://learn.chatgpt.com/docs/config-file/config-advanced#config-and-state-locations)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- [Codex non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Claude environment variables](https://code.claude.com/docs/en/env-vars)
- [Claude hook reference](https://code.claude.com/docs/en/hooks)
- [Claude subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude monitoring](https://code.claude.com/docs/en/monitoring-usage)
- [Gemini session management](https://geminicli.com/docs/cli/session-management/)
- [Gemini hooks](https://geminicli.com/docs/hooks/reference/)
- [Gemini local telemetry](https://geminicli.com/docs/cli/telemetry/)
- [OpenCode v2 commands](https://dev.opencode.ai/v2/docs/cli/commands/)
- [OpenCode v2 experimental API](https://dev.opencode.ai/v2/docs/api)
- [Cursor hooks](https://cursor.com/docs/hooks)
- [Cursor CLI output format](https://cursor.com/docs/cli/reference/output-format)
- [Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference)
- [Copilot usage metric scope](https://docs.github.com/en/copilot/reference/copilot-usage-metrics/copilot-usage-metrics)

The old Cursor admin API URL redirects to the docs home page; it did not establish
a current repository-attributable local token contract. Do not substitute assumptions
or scrape an undocumented account endpoint to fill this gap. Other tools such as
Aider, Cline/Roo, and pi belong behind the explicit import/adapter interface until
their accounting contracts receive the same research and fixtures. MCP is a tool
protocol, not a universal usage meter.

## GitHub/Git constraints behind the recommendation

- Git hooks run locally and can be relocated with `core.hooksPath`. A pre-push hook
  receives selected refs on stdin; writing a new file does not put it into those
  already-selected commits. [Git hooks](https://git-scm.com/docs/githooks)
- Ordinary fast-forward ref updates provide the serialization point for a single
  data-branch transaction. A rejected concurrent update can be rebuilt against the
  new parent. Do not use force pushes for synchronization.
  [Git push](https://git-scm.com/docs/git-push)
- Notes introduce their own merge/rewrite/fetch behavior and do not serve a badge
  image directly. [Git notes](https://git-scm.com/docs/git-notes)
- Fork pull-request workflows have restricted permissions. A trusted importer should
  parse accepted data, not execute fork code with a write token.
  [Workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- `GITHUB_TOKEN` pushes generally do not trigger another push workflow. Import and
  rendering must happen together; do not depend on a follow-up workflow to repair
  the badge. [Workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- Shields endpoint badges require a reachable JSON endpoint. Locally generated SVG
  removes that dependency; authenticated private README rendering still needs an
  actual feasibility test. [Shields endpoint](https://shields.io/badges/endpoint-badge)
- Node 20 is EOL; Node 22/24 are LTS and 26 is Current on the audit date. A breaking
  release can choose Node 24 as its floor instead of preserving an obsolete matrix.
  [Node release status](https://nodejs.org/en/about/previous-releases)

## Preserve, rewrite, delete

| Preserve and improve | Rewrite | Delete after replacement |
| --- | --- | --- |
| ESM TypeScript, npm workspaces | Unit identity and lineage | Gist client/auth/targets |
| Commander and strict Zod boundaries | Provider readers/cursors | Legacy/shared Gist migration |
| Sanitized testkit factories | Attribution using Git topology | Readback/hash-recovery machinery |
| README managed-block concept | Journal/outbox and synchronization | Global PATH runtime dependency |
| Numeric formatting primitives | Hook/runtime setup and uninstall | Broad heuristic model matching |
| Aggregate redacted diagnostics | Pricing with coverage/provenance | Unknown-price-as-zero behavior |
| Package-content verification, OIDC | Real install/transport/platform tests | Phrase-based v1 documentation assertions |

## Limits and required follow-up evidence

No replacement product code, public branch, Gist, release, workflow, or external
deployment was created by this planning task. Local GSD cleanup is the only
implementation change: instructions/history removal plus neutral `--output-dir`
naming in recovery/release evidence scripts, their tests, and maintainer examples.
The refactoring branch is local.

Git synchronization still needs the broader platform and recovery tests described
above. The private-image URL, specific SQLite runtime floor, and modern adapter
compatibility need the explicit feasibility gates in the plan. There is no claim
that every agent exposes exact usage, that all historical
logs still exist, that hook trust can be installed for another person, or that
self-reported repository data is a verified bill. These limits are part of the
product contract, rather than cases to hide behind a successful badge refresh.
