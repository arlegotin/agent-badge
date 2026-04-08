# Quickstart

Use this guide to get a live badge into a repo quickly and without guessing what the CLI is doing.

Commands below are shown as `agent-badge ...` for readability. In an npm-initialized repo, run them as `npx --no-install agent-badge ...` unless the binary is already on your `PATH`.

Before you start:

- use Node `20.x`, `22.x`, or `24.x`
- run inside an existing Git repo
- expect meaningful results only if `~/.codex` and/or `~/.claude` exists

For the complete support matrix, see [INSTALL.md](INSTALL.md).

## Fastest Path

```bash
npm init agent-badge@latest
```

That initializer runs `agent-badge init` in the current directory and sets up the repo-local runtime.

At the end of init, look for the final `- Setup:` line:

- `- Setup: complete...` means the local runtime and live badge publishing are ready.
- `- Setup: local setup complete, but GitHub auth is still required...` means install succeeded, but you still need GitHub auth before the gist-backed badge can publish.

Typical init output starts with the real preflight checks:

```text
agent-badge init preflight
- Git: existing repository, origin configured
- README: README.md
- Package manager: npm
- Providers: codex=yes (~/.codex), claude=yes (~/.claude)
- GitHub auth: not detected
- Existing scaffold: none
```

When auth is available, the final publish lines look like this:

```text
- Publish target: created public gist
- Setup: complete. Local runtime, pre-push refresh, and live badge publishing are ready.
```

When auth is missing, the final publish lines look like this:

```text
- Publish target: deferred
- Badge setup deferred: set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT to create a public gist automatically, or rerun `agent-badge init --gist-id <id>` to connect an existing public gist.
- Setup: local setup complete, but GitHub auth is still required before the live badge can publish. Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT, then rerun `agent-badge init` or connect a public gist with `agent-badge init --gist-id <id>`.
```

What init usually handles for you:

- installs `@legotin/agent-badge` locally in the repo
- creates `.agent-badge/config.json` and `.agent-badge/state.json`
- adds managed package scripts and a `pre-push` refresh hook
- updates `.gitignore` for local state, cache, and logs
- creates or reuses a public gist if GitHub auth is available
- inserts the badge into `README.md` when a stable badge URL is ready

## If Publish Was Deferred

If GitHub auth was not available during init, local setup still completes but gist publishing is deferred.

You can fix that in either of these ways:

1. Export `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT`, or authenticate with `gh auth login` so `gh auth token` works in the same environment, then rerun `agent-badge init`.
2. Create a public gist yourself, then run:

```bash
agent-badge init --gist-id <id>
```

Then verify the result:

```bash
agent-badge status
```

Healthy shared-mode output looks like:

```text
agent-badge status
- Totals: 5 sessions, 610 tokens
- Providers: codex=enabled, claude=enabled
- Publish: published | gist configured=yes | last published=2026-03-30T19:10:00.000Z | gistId=gist_789 | lastPublishedHash=hash_789
- Pre-push policy: fail-soft
- Live badge trust: current
- Last successful badge update: 2026-03-30T19:10:00.000Z
- Shared mode: shared | health=healthy | contributors=2
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

For automation or CI-like checks, use:

```bash
agent-badge doctor --json
```

If either command surfaces a `Recovery path` or `- Recovery:` line, follow the exact command in [RECOVERY.md](RECOVERY.md).

## Manual Install Instead Of The Initializer

If you want the runtime without `npm init`, install it directly and run init yourself:

```bash
npm install -D @legotin/agent-badge
npx --no-install agent-badge init
```

## What To Read Next

- [Install](INSTALL.md)
- [Authentication](AUTH.md)
- [CLI Reference](CLI.md)
- [How It Works](HOW-IT-WORKS.md)
- [Configuration](CONFIGURATION.md)
- [Recovery](RECOVERY.md)
- [Attribution Model](ATTRIBUTION.md)
- [Privacy Model](PRIVACY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
