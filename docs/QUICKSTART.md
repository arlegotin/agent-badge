# Quickstart

Use this guide to get a live badge into a repo quickly and without guessing what the CLI is doing.

Commands below are shown as `agent-badge ...` for readability. That is the default shared runtime path after `npm init agent-badge@latest`: use `agent-badge` directly when the shared runtime is on your `PATH`. If you explicitly install `@legotin/agent-badge` inside the repo instead, use your package manager's exec form for that alternative path.

Before you start:

- use Node `20.x`, `22.x`, or `24.x`
- run inside an existing Git repo
- expect meaningful results only if `~/.codex` and/or `~/.claude` exists

For the complete support matrix, see [INSTALL.md](INSTALL.md).

## Fastest Path

```bash
npm init agent-badge@latest
```

That initializer runs `agent-badge init` in the current directory, writes the repo-owned scaffold, and assumes a shared runtime/global or user-scoped CLI path for later commands.

At the end of init, look for the final `- Setup:` line:

- `- Setup: complete. Shared runtime, pre-push refresh, and live badge publishing are ready.` means the shared runtime and live badge flow are ready.
- `- Setup: repo setup complete, but GitHub auth is still required...` means the minimal repo scaffold is in place, but you still need GitHub auth before the gist-backed badge can publish.

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
- Setup: complete. Shared runtime, pre-push refresh, and live badge publishing are ready.
```

When auth is missing, the final publish lines look like this:

```text
- Publish target: deferred
- Badge setup deferred: set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT to create a public gist automatically, or rerun `agent-badge init --gist-id <id>` to connect an existing public gist.
- Setup: repo setup complete, but GitHub auth is still required before the live badge can publish. Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT, then rerun `agent-badge init` or connect a public gist with `agent-badge init --gist-id <id>`.
```

What init usually handles for you:

- creates `.agent-badge/config.json` and `.agent-badge/state.json`
- writes managed `.gitignore` entries for local state, cache, and logs plus the direct shared-runtime `pre-push` refresh hook
- creates or reuses a public gist if GitHub auth is available
- inserts the badge into `README.md` when a stable badge URL is ready
- does not create managed runtime manifest ownership by default

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

If you want explicit repo-owned runtime dependencies instead of the global-first initializer path, use the direct package-install flow in [INSTALL.md](INSTALL.md).

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
