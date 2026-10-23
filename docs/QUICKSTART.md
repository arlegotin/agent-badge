# Quickstart

These commands require Agent Badge **2.0.0 or newer**. Version 1 uses the previous Gist architecture and has no automatic migration. See [release status](maintainers/RELEASE-STATUS.md) for publication and verification evidence.

In your repository, follow [installation](INSTALL.md) and run:

**Before setup:** [release status](maintainers/RELEASE-STATUS.md) must confirm v2
publication and the `latest` tag. Publication is currently pending and `@latest`
still selects v1; do not use it to activate v2 until that gate is complete.

```sh
npm init agent-badge@latest
```

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
node .agent-badge/run.cjs contribute
```

Stage the generated `.agent-badge/contributions/<digest>.json` with your normal PR. The command does not stage or commit. Keep the immutable file until trusted default-branch import completes; closed/unmerged PRs do not contribute upstream totals. [CLI](CLI.md) describes import retries and explicit controls.
