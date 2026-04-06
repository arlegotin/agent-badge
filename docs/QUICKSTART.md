# Quickstart

Use this guide to get a live badge into a repo quickly and without guessing what the CLI is doing.

Commands below are shown as `agent-badge ...` for readability. In an npm-initialized repo, run them as `npx --no-install agent-badge ...` unless the binary is already on your `PATH`.

## Fastest Path

```bash
npm init agent-badge@latest
```

That initializer runs `agent-badge init` in the current directory and sets up the repo-local runtime.

At the end of init, look for the final `- Setup:` line:

- `- Setup: complete...` means the local runtime and live badge publishing are ready.
- `- Setup: local setup complete, but GitHub auth is still required...` means install succeeded, but you still need GitHub auth before the gist-backed badge can publish.

What it usually handles for you:

- installs `@legotin/agent-badge` locally in the repo
- creates `.agent-badge/config.json` and `.agent-badge/state.json`
- adds managed package scripts and a `pre-push` refresh hook
- updates `.gitignore` for local state, cache, and logs
- creates or reuses a public gist if GitHub auth is available
- inserts the badge into `README.md` when a stable badge URL is ready

## If Publish Was Deferred

If GitHub auth was not available during init, local setup still completes but gist publishing is deferred.

You can fix that in either of these ways:

1. Export `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT`, then rerun `agent-badge init`.
2. Create a public gist yourself, then run:

```bash
agent-badge init --gist-id <id>
```

Then verify the result:

```bash
agent-badge status
```

For stale after failed publish, missing local contributors, partial shared metadata, or gist reconnect flows, use [RECOVERY.md](RECOVERY.md) as the canonical runbook.

## Everyday Commands

Check current state:

```bash
agent-badge status
```

Run a full attribution report:

```bash
agent-badge scan
```

Refresh local totals and publish if the payload changed:

```bash
agent-badge refresh
```

Inspect setup, provider detection, gist wiring, README badge markers, and hook health:

```bash
agent-badge doctor
```

If either command surfaces a `Recovery path` or `- Recovery:` line, follow the exact command in [RECOVERY.md](RECOVERY.md).

## Manual Install Instead Of The Initializer

If you want the runtime without `npm init`, install it directly and run init yourself:

```bash
npm install -D @legotin/agent-badge
npx --no-install agent-badge init
```

## What To Read Next

- [How It Works](HOW-IT-WORKS.md)
- [Configuration](CONFIGURATION.md)
- [Recovery](RECOVERY.md)
- [Attribution Model](ATTRIBUTION.md)
- [Privacy Model](PRIVACY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
