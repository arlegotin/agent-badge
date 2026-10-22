# Quickstart

This documents the unreleased repository-native replacement. Published npm `1.1.20` uses the previous architecture and does not provide these commands. Candidate artifacts and external release gates remain pending.

Follow [installation](INSTALL.md) to obtain a verified candidate. After its release, the initializer entry point is `npm init agent-badge@latest`; current public releases do not provide the replacement.

In a configured clone, explicitly activate and inspect:

```sh
node .agent-badge/run.cjs setup
node .agent-badge/run.cjs doctor --json
node .agent-badge/run.cjs status --json
```

Review native provider project trust and hook settings, then restart it. Work on the repository where the agent runs. Reconcile historical data manually, outside a hook:

```sh
node .agent-badge/run.cjs collect --full
node .agent-badge/run.cjs sync
```

`collect` writes only private local state. `sync` captures incrementally and attempts a bounded data-branch transaction. Offline work stays pending; `synced` means a validated remote commit confirmed the batch. Partial provider coverage can remain even after sync succeeds.

A fork with an unbound upstream route can submit sanitized usage through its normal PR:

```sh
agent-badge contribute
```

Stage the generated `.agent-badge/contributions/<digest>.json` with your normal PR. The command does not stage or commit. Keep the immutable file until trusted default-branch import completes; closed/unmerged PRs do not contribute upstream totals. [CLI](CLI.md) describes import retries and explicit controls.
