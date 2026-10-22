# Repository hook integration contract — 2026-10-22

Hooks schedule local collection. They are never additive accounting receipts and
cannot make locally stored provider history visible to CI.

## Provider evidence and supported adapters

Codex's inspected source is commit
[`86e17e98c7f901277aeeb4649cf1b01462b082f2`](https://github.com/openai/codex/commit/86e17e98c7f901277aeeb4649cf1b01462b082f2).
Its [discovery engine](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/hooks/src/engine/discovery.rs#L378)
discovers `hooks.json` adjacent to active config layers or inline TOML hooks.
The JSON adapter merges exact owned Stop/SubagentStop command groups into
`.codex/hooks.json`. A `.codex` directory is enough to create an empty project
layer when `config.toml` is absent; no dummy TOML is written.
It preserves existing TOML bytes; inline hooks and unsupported schemas require
manual review. It does not invent a `hooks.d` discovery mechanism.
[Configuration types](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/config/src/hook_config.rs)
establish event arrays, handler groups and timeout seconds.
[Native hook guidance](https://learn.chatgpt.com/docs/hooks) requires project
trust and review of non-managed hooks. Writing config does not grant trust.
This pinned source shape is not certification of every released Codex version.
The pinned [SubagentStop stdin schema](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/hooks/src/schema.rs#L607)
and [event builder](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/hooks/src/events/stop.rs#L165)
also expose `agent_transcript_path`; both Codex and Claude SubagentStop target that
child field. Missing/null child paths never silently route the parent as a child.

At this same pin, the [config loader](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/config/src/loader/mod.rs#L1147)
redirects linked-worktree hook folders to the primary checkout's matching
`.codex` directory. Its
[merge step](https://github.com/openai/codex/blob/86e17e98c7f901277aeeb4649cf1b01462b082f2/codex-rs/config/src/loader/mod.rs#L1974)
removes worktree-local inline hook declarations and loads primary-checkout hooks;
the discovery engine reads JSON from that overridden folder. Local
`.codex/hooks.json` alone therefore does not establish Codex hook execution in a
linked worktree. Setup inspects the primary Git worktree registration and its
bounded configuration. Missing/unsupported primary hooks produce an explicit
primary-checkout setup/native review action. It never writes another checkout;
common-directory Git hooks remain available. Even recognized primary config
proves neither native project trust nor a released-version range. Synthetic
linked-worktree tests verify the installer reports this boundary and preserves
the primary checkout.

Claude's [hook reference](https://code.claude.com/docs/en/hooks#subagentstop)
documents common `hook_event_name`, `transcript_path`, `cwd` and `session_id`.
For SubagentStop, `transcript_path` remains the parent; the child stream is
`agent_transcript_path`. The JSON adapter merges Stop/SubagentStop groups into
`.claude/settings.json`, preserving permission settings and unrelated groups.
Native settings/trust review and provider restart remain explicit local steps.
SessionEnd's shorter native timeout is not configured by this adapter.
Claude historical JSONL numeric accounting remains unsupported/unknown; see
the separate Claude accounting contract. Hook totals cannot repair that gap.

Synthetic routing fixtures (paths and IDs are invented):

```json
{"hook_event_name":"Stop","transcript_path":"/synthetic/parent.jsonl","session_id":"synthetic-parent","cwd":"/synthetic/repo","last_assistant_message":"discarded"}
{"hook_event_name":"SubagentStop","transcript_path":"/synthetic/parent.jsonl","agent_transcript_path":"/synthetic/child.jsonl","agent_id":"synthetic-child","cwd":"/synthetic/repo"}
```

The bootstrap bounds stdin to 64 KiB and the remaining automatic deadline,
accepts only these two events and an absolute routing path, and discards every
other field. It does not log or persist the payload. Routing hints filter sources
already independently discovered under trusted provider roots. They never enroll
an arbitrary path or create accounting identities.

## Runtime, deadlines and local prerequisites

Every clone requires explicit setup. Shared provider commands contain a fixed,
built-in Node locator, with no machine-private absolute paths and no execution of
tracked `.agent-badge/run.cjs`. Provider PATH must expose Node 24 or 26 and Git;
missing prerequisites fail softly with an action item. Native provider execution
was not exercised on this implementation host; JSON adapter/command behavior is
tested with synthetic payloads and real shell/Git processes.

The locator starts its two-second budget before Git lookup. It owns/reaps the
locator Git process group and passes remaining time to the private approved
bootstrap. Bounded payload parsing and lightweight import subtract from that
same budget. The approved parent supervises activation/import, collection and
transport in one Task10 worker group/lease, without a nested detached worker.
Native command groups allow ten seconds so their independent timer does not kill
the supervisor before its two-second operation and owned cleanup finish; this is
not an extension of Badge's internal deadline.
Capture persists available local observations using accepted local policy before
network work; timeout/offline/unbound results retain pending work. Large/full
reconciliation stays manual. The OS may add process-start/scheduling overhead.

Git pre-push uses the explicitly approved Node executable, including minimal GUI
PATH. It buffers refs once and replays exact bytes to each executable. Buffering
elapsed time counts against Badge's budget; time spent by an existing user hook
remains the user's normal Git behavior. User interpreter arguments, environment,
working directory and exit status are retained. An executable backup remains in
the same directory under an extensionless name, preserving sibling imports and
relative symlinks. Ignored nonexecutable hooks remain ignored. Exact original
bytes, modes, symlink target and managed hashes are recorded privately.
The private Git driver also propagates an absolute monotonic millisecond deadline
from `process.hrtime.bigint()` (same-host POSIX system monotonic clock) alongside
remaining duration. Bootstrap validates a safe integer, rejects expired or
out-of-window deadlines, and clamps again after its startup. Wall-clock/UTC
adjustments cannot grant extra time. A deterministic400ms delayed bootstrap and
an already-expired startup are exercised through the actual private driver;
invalid deadlines skip before importing a worker. Initial shell/Node process
launch before the driver's first instruction remains OS scheduling overhead.

Known self-dispatch hook managers, shared/global hooksPath and legacy
`# agent-badge:start` / `# agent-badge:end` blocks require explicit local
integration/cleanup. Setup refuses to disguise an old Gist writer as a user
delegate. It preserves unrelated code and never runs a hook to inspect it.
Common-directory hooks work across old branches and linked worktrees; a present
changed tracked pin suspends runtime execution. Worktree-local custom hooksPath
only works where its wrapper exists. Missing/different files on another branch
or worktree require an explicit integration action and are not universal common
activation. Setup/removal refuses edited owned files rather than discarding them.

Windows automatic operation is explicitly unsupported before automatic spawn.
POSIX CRLF-body/refs preservation is tested; no Windows execution pass is claimed.
Manual Windows cancellation remains Task10's documented best-effort capability.

## Consuming APIs and ownership

`@legotin/agent-badge/integration/hooks` exports async
`planHooks(context, runtime): Promise<HookPlan>`, `applyHookPlan(plan)` and
`removeHooks(context)`. A plan contains exact snapshots, wrapper, runtime location,
refusal action items and worktree-path notices. Private `hooks.json` owns the
wrapper/driver hashes and exact executable backup; no Git config is overwritten.

`@legotin/agent-badge/integration/agent-hooks` exports `planAgentHooks(cwd)`,
`applyAgentHookPlan(plan)` and `removeAgentHooks(cwd)`. Tracked
`.agent-badge/agent-hooks.json` records exact owned event groups; removal preserves
later unrelated changes. Successful configuration reports
`configured-needs-trust`, never native trust approval. The Task11 setup plan
includes these tracked changes and private hook effects, applies them during
activation, and surfaces action items in CLI output and generated local README.

Core's lightweight `operations/supervisor` and worker-only `operations/worker`
subpaths support the single approved runtime worker. The parent derives lease
cleanup authority from its installed private module path; the child verifies Git
common-directory membership, declaration/pin and approved runtime before capture.
