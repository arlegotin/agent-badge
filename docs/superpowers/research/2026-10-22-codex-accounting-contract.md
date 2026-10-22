# Codex accounting contract research — 2026-10-22

Scope: official source inspection only; no installed agent, private history, credentials, model work, or app-server attachment. Pin: [`openai/codex` 86e17e98c7f901277aeeb4649cf1b01462b082f2](https://github.com/openai/codex/commit/86e17e98c7f901277aeeb4649cf1b01462b082f2), committed 2026-10-22 06:32 UTC. This certifies source shapes, **not a released-version range**. Record this commit separately from synthetic fixture version and observed `cli_version`.

## Accounting representation

The [wire enum](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/history/src/rollout_payload.rs#L30) uses top-level `type` plus `payload`; [the writer](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/rollout/src/recorder.rs#L2112) adds `timestamp` and optional `ordinal`, then newline and flush. Relevant discriminators:

- `session_meta`: first canonical metadata; later copied metadata must not replace the file owner.
- `turn_context`: durable `turn_id`, optional `root_turn_id`, `cwd`, and `model`, plus permissions/configuration.
- `token_usage_record`: completed-response request accounting.
- `event_msg` with payload `type: "token_count"`: optional `info` containing `last_token_usage`, `total_token_usage`, `model_context_window`; also optional `rate_limits`.

The [protocol](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/protocol/src/protocol.rs#L2370) defines `TokenUsageRecord` with `thread_id`, `turn_id`, `session_id`, `root_turn_id`, `response_id`, `usage`, `turn_token_usage`, `thread_token_usage`. Each usage has `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens` (defaults zero), `output_tokens`, `reasoning_output_tokens`, `total_tokens`. No request model or cwd field exists here.

Count **only `usage` once per original request**. [Session state](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/core/src/state/session.rs#L228) explicitly adds request usage into separate turn/thread aggregates. [Completion recording](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/core/src/session/mod.rs#L5108) persists no request record when usage is absent. The [official synthetic integration test](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/core/tests/suite/token_usage_rollout.rs) confirms accumulation across resume and omission for missing usage.

`token_count` is not certified request accounting: updates can repeat, reflect context estimates, or become a context-window-full marker with zero component dimensions. Do not sum snapshots, subtract arbitrary adjacent snapshots, infer missing response IDs, or manufacture zero requests from discovery. A snapshot-only rollout has unsupported/partial accounting coverage.

## Identity, inheritance, attribution

Recommendation: local identity `(codex, original token_usage_record.thread_id, response_id)`; dedupe it across enrolled homes, archive moves, copied history, and replacement files. Preserve original identity, not the enclosing rollout filename or child ID. Conflicting duplicates require explicit uncertainty, not last-file-wins.

[Session metadata](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/protocol/src/protocol.rs#L3256) separates stable thread `id`, root `session_id`, spawned `parent_thread_id`, logical `forked_from_id`/`forked_from_ordinal_exclusive`, physical `history_base`, and `subagent_history_start_ordinal`. `history_base.thread_id` means **rollout ID**, which may differ from stable thread ID after revert; its ordinal and byte offset are exclusive cutoffs.

[Ordinal state](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/rollout/src/ordinal.rs) distinguishes legacy files without ordinals from paginated files. New paginated metadata occupies ordinal zero or the inherited exclusive cutoff; subsequent own records follow it. Child records before `subagent_history_start_ordinal` are inherited. [Lineage resolution](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/thread-store/src/local/rollout_lineage.rs#L202) resolves prefix files independently; do not treat a physical prefix as newly incurred child work. [The fallback helper](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/rollout/src/metadata.rs#L120) declines ambiguous legacy revert fork boundaries. Follow that boundary; never guess from timestamps or line numbers.

[Compaction payloads](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/history/src/rollout_payload.rs#L251) can embed `latest_token_usage_record` as a checkpoint. This is not additional request usage; replacement context likewise is not new work. Previously incurred usage remains counted despite context deletion/revert.

Associate each request with the matching original turn's preceding `turn_context`, in certified source order, retaining changes through compaction and model switches. Never apply the final database model/cwd to all requests. [Context persistence](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/core/src/session/mod.rs#L5040) and [context construction](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/core/src/session/turn_context.rs#L903) establish this association for ordinary turns. **Uncertified:** concurrent/mid-turn live model updates, backend reroutes, multiple execution environments, absent turn IDs/context, or missing ancestor context. The request record alone cannot prove the exact model/environment; report unknown attribution there.

## Inventory and source roots

Resolve explicitly enrolled homes first, otherwise nonempty `CODEX_HOME`, otherwise `~/.codex`; canonicalize for dedupe. Official [home resolution](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/utils/home-dir/src/lib.rs) requires an explicitly supplied home to exist. Search known `sessions` and `archived_sessions` rollout locations, including nested date directories. Current storage also supports [`.jsonl.zst`](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/rollout/src/compression.rs#L63); without a compatible bounded decoder, expose compressed coverage as unsupported. Never invoke Codex to materialize it. `history.jsonl` can aid discovery only.

[Current DB filename](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/state/src/sqlite.rs#L43) is `state_5.sqlite`. [Initial threads schema](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/state/migrations/0001_threads.sql) provides `id`, `rollout_path`, `cwd`, timestamps, archive status, provider, and aggregate `tokens_used`; [later model fields](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/state/migrations/0020_threads_model_reasoning_effort.sql) are latest-thread metadata. Optional [spawn edges](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/state/migrations/0021_thread_spawn_edges.sql) contain parent/child/status, not request accounting.

Use WAL-aware read-only inventory; probe tables/columns, select only necessary fields, tolerate absent lineage tables, and fall back to rollouts on incompatible DBs. Never migrate/checkpoint/recover the provider DB or use `tokens_used` as the accounting source. [Official location documentation](https://learn.chatgpt.com/docs/config-file/environment-variables) also exposes `sqlite_home` and `CODEX_SQLITE_HOME`; DB location can differ from rollout home. Do not imply a default-home inventory discovers all installations.

## Modern owned hook configuration

[Discovery source](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/hooks/src/engine/discovery.rs#L378) loads exact `hooks.json` beside active config layers, or inline `[hooks]` in `config.toml`; arbitrary owned JSON filenames/`hooks.d` are not discovered. Merge only identifiable owned entries into `<repo>/.codex/hooks.json`, preserving existing entries. Exact synthetic shape:

```json
{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"agent-badge collect --provider codex","timeout":10}]}],"SubagentStop":[{"hooks":[{"type":"command","command":"agent-badge collect --provider codex","timeout":10}]}]}}
```

Command here is illustrative; CLI availability must be established separately. [Configuration types](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/config/src/hook_config.rs) confirm capitalization, event arrays, matcher groups, handler `type`, `command`, timeout seconds. Omit matcher to include all subagent types. [Hook stdin](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/hooks/src/schema.rs#L589) includes turn/session IDs, paths, cwd, model, and potentially assistant text: discard text immediately; never persist/log the payload. Hooks signal collection; they do not contain response usage. [Official hooks guidance](https://learn.chatgpt.com/docs/hooks) requires project trust plus review of non-managed hooks; configuration does not establish activation. Preserve this as an explicit setup capability/coverage state.

## Synthetic request fixture shape

Non-UUID labels below are placeholders for generated synthetic IDs; omitted session/context fields require fixture defaults. `u` expands identically in all three fields for the first request:

```text
u = {input_tokens:100,cached_input_tokens:20,cache_write_input_tokens:0,output_tokens:10,reasoning_output_tokens:3,total_tokens:110}
{timestamp:"2026-10-22T00:00:00.000Z",ordinal:1,type:"turn_context",payload:{turn_id:"t1",cwd:"/synthetic/repo",model:"synthetic-model",...}}
{timestamp:"2026-10-22T00:00:01.000Z",ordinal:2,type:"token_usage_record",payload:{thread_id:"original",turn_id:"t1",session_id:"root",root_turn_id:"t1",response_id:"resp-synthetic-1",usage:u,turn_token_usage:u,thread_token_usage:u}}
```

Copy that exact request into a fork/second home, embed it in a compaction checkpoint, and repeat token-count snapshots: expected usage remains 110. Add an original child request with a distinct response ID to count child work. Include missing boundary/context, malformed final line, truncation, and conflicting duplicate cases as uncertainty, never invented identities.

## Implemented adapter boundary

`providers/codex/adapter.ts` implements the new `ProviderAdapter` alongside the
retained v1 collector until Task17. `identity.ts` owns the pure immutable-final
request contract registered in `providers/registry.ts`. `compatibility.json`
records source revision, synthetic fixture revision, limits and unsupported
representations separately; no installed or released CLI version is certified.

Explicit enrolled roots override nonempty `CODEX_HOME`, then `~/.codex`.
`createCodexAdapter({sqliteHome})` accepts the resolved `sqlite_home` setting;
otherwise `CODEX_SQLITE_HOME` overrides each rollout home for DB inventory.
The adapter does not parse arbitrary user configuration or invoke Codex. A
schema-probed read-only `node:sqlite` connection selects only rollout paths,
observes committed WAL and falls back to scanning known rollout directories.
Inventory failures become independent diagnostic sources. Existing v1 query
exports also use WAL-aware read-only connections until their deletion.
Compressed rollouts remain explicitly unsupported; no decoder is invoked.

The private checkpoint continuation is a strict bounded metadata envelope:
provider, reader version and serialized state (64 KiB maximum). Codex state
contains a physical epoch, first owner/lineage metadata, at most128 preceding
turn IDs/model/cwd contexts, last ordinal and uncertainty/accounting flags.
It contains no raw tail, transcript, prompt, response content, compaction text,
or token snapshots. Excess contexts invalidate attribution conservatively.
Missing/invalid state, policy/repository/reader mismatch and prefix mismatch
force safe replay. A partial last line stays in the source, with the cursor at
the previous newline. Parsing is bounded to16MiB and1000 observations per scan;
long sources backfill in bounded batches with metadata state preserved.

`LocalStore.checkpointCandidate(source)` returns the latest durable candidate
by provider/instance/actual source identity, without older fallback or a claim
that it is reusable. The adapter validates scope, schema, reader, physical epoch
and the entire consumed prefix hash. Prefix hashing streams old bytes; only the
new bounded suffix is parsed. Same-size/same-mtime rewrites cannot bypass hashing.
Discovery provides the physical epoch hash(dev,inode,birthtime). Verified appends
preserve the candidate's logical generation. Replay resets chain a fresh opaque
logical generation from prior generation and current evidence; generations are
never ordered. `ScanBatch.source` is the validated source descriptor for the
batch; the collector must commit that exact descriptor. Source generation is
checked before/after reading, including path replacement. The store retains
its monotonic cursor and obsolete-generation guards. A shared lock must cover
candidate retrieval, scan and batch commit. Full and incremental public request
records converge independently of private logical source generation.

No bounded parsing claim is a2s hook benchmark: prefix verification cost grows
with consumed bytes, and the caller must supply its total-budget AbortSignal.
A line larger than the scan budget cannot progress at that budget and remains
partial; a manual caller may increase `maxBytes` up to64MiB. A line exceeding
256KiB is skipped with explicit incomplete coverage. Missing inherited
boundaries remain partial and uncounted, rather than guessed from timestamps.

## Exact model identity follow-up — 2026-10-22

The [official Codex/Work model documentation](https://learn.chatgpt.com/docs/models?surface=app)
explicitly identifies `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna` and `gpt-6-astra`.
Account, client and rollout affect availability; this is no universal default
promise. The [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4)
and [GPT-5.3-Codex](https://developers.openai.com/api/docs/models/gpt-5.3-codex)
model documents identify exact historical IDs worth retaining for recorded
work. The shared closed identity registry recognizes all six as OpenAI models,
without adding rate cards. The current flat standard-text catalog does not
certify GPT-5.4's >272K session/prompt multiplier, no API rates were certified
for the four GPT6 identities, and GPT-5.3-Codex tariff certification remains
pending. Unknown costs remain unknown. No suffix, gateway deployment or
configuration selector is treated as an exact execution-model identity.

Physical pagination fixture: the pinned
[`HistoryPosition` struct](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/protocol/src/protocol.rs#L3234)
serializes `history_base.thread_id`, `end_ordinal_exclusive` and `end_byte_offset`.
There is no `history_base.ordinal`. A boundary at ordinal12/byte4096 limits the
referenced prefix rollout; the owning file can begin with metadata at ordinal12,
then own records13 and14. The fixture certifies own request14 despite there being
only three physical lines. The adapter reads each rollout independently and
never synthesizes prefix usage from metadata. Physical pagination alone does
not establish a logical fork or parent thread: `lineage.kind` follows actual
parent/fork fields, while inherited physical history remains isolated. Prefix
rollout IDs stay private and are not substituted for native parent thread IDs.
