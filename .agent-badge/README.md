# Agent Badge

Requires Linux or macOS, Node 24 or 26 and npm. Run both the coding agent and Badge inside Linux when using WSL2. Each clone needs explicit activation:

```sh
node .agent-badge/run.cjs setup
```

Only local agent usage can be collected. CI cannot discover histories on another machine. Initial state may be queued or unavailable; see data and coverage on refs/heads/agent-badge/data. No measurement is a claim of complete coverage or a bill.

Fork origins that differ from the declaration collect locally with auto-sync unbound. Writers may explicitly select setup --target upstream. A standalone fork uses setup --new-repository --repository-url <fork-url> in a fresh clone without private Badge state, creating a new UUID. Existing remote ledgers with a different UUID are never overwritten.

Fork contributors run node .agent-badge/run.cjs contribute, then stage the generated .agent-badge/contributions/<digest>.json with their normal PR. This is an explicit normal-staging exception: contribute never stages or commits. Only accepted default-branch envelopes affect upstream; closed or unmerged PRs do not. Retain the immutable file until trusted import succeeds; retry import/reconciliation after offline or queued outcomes.

GitHub setup constructs a fixed public badge.svg route linked to the data-branch report. Repository visibility is not probed. Public-route construction is supported; hosted/private authenticated image rendering remains unverified, and caches may show old images after confirmed sync. Other hosts have no inferred GitHub image route.

Setup installs a private pre-push delegate and shared Codex/Claude Stop and SubagentStop wakeups, plus a Gemini AfterModel wakeup. Existing user hook failures still block pushes. Legacy Agent Badge/Gist markers, shared hooksPath and self-dispatching hook managers require explicit local cleanup/integration; inspect setup action items.

Provider hooks require Node 24 or 26 on the provider PATH plus explicit native project trust and hook review. Review .codex/hooks.json, .claude/settings.json and .gemini/settings.json in the provider, then restart it. Setup never grants native trust. On the inspected Codex source generation, linked worktrees load hooks from the primary checkout; review/setup that checkout explicitly when required. Worktree-local Codex config alone does not establish native hooks. Git hooks retain the approved Node executable for minimal GUI PATH. agent-badge: Native Windows is unsupported. Run Agent Badge and the coding agent in Linux/WSL2, or use macOS.

Automatic work has a two-second total budget and retains available local usage before transport. Pre-push streams refs to the existing hook immediately and only retains a bounded 1 MiB Badge copy until EOF. Open, oversized or expired input skips Badge while preserving the user hook lifetime and input. Incomplete capture remains pending for manual reconciliation. Provider payloads only route bounded local reads; they are never usage receipts. Claude historical JSONL numeric accounting is unsupported/unknown. Gemini saved-success coverage is partial: failed attempts can be absent, and AfterModel only wakes collection; it is never an independent receipt. Gemini exact model IDs remain unpriced. Fresh clones require explicit setup. An already activated common directory can reuse its approved private runtime from older branches without a tracked pin; a changed pin requires explicit setup.
