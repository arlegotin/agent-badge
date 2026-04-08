# CLI Reference

Commands below are shown as `agent-badge ...` for readability. Use the repo-local wrapper that matches your package manager:

- npm: `npx --no-install agent-badge`
- pnpm: `pnpm exec agent-badge`
- yarn: `yarn agent-badge`
- bun: `bunx --bun agent-badge`

## Command Summary

| Command | Purpose |
| --- | --- |
| `init` | Install repo wiring and connect or reuse the publish gist. |
| `scan` | Run a full attribution report and optionally resolve ambiguous sessions. |
| `publish` | Publish aggregate badge JSON to the configured gist target. |
| `refresh` | Refresh persisted totals and publish only when needed. |
| `status` | Show current local, shared, and publish state. |
| `doctor` | Inspect setup, auth, gist wiring, and README or hook health. |
| `config` | Read or update supported config keys. |
| `uninstall` | Remove repo wiring and optionally purge local or remote state. |

## `init`

```bash
agent-badge init [--gist-id <id>]
```

| Option | Meaning |
| --- | --- |
| `--gist-id <id>` | Reuse an existing public gist instead of creating one automatically. |

Expected terminal endings:

```text
- Publish target: created public gist
- Setup: complete. Local runtime, pre-push refresh, and live badge publishing are ready.
```

or:

```text
- Publish target: deferred
- Setup: local setup complete, but GitHub auth is still required before the live badge can publish.
```

## `scan`

```bash
agent-badge scan [--include-session <provider:sessionId>] [--exclude-session <provider:sessionId>]
```

| Option | Meaning |
| --- | --- |
| `--include-session <provider:sessionId>` | Persist an include override for an ambiguous session in the current scan. |
| `--exclude-session <provider:sessionId>` | Persist an exclude override for an ambiguous session in the current scan. |

Representative output:

```text
Repo: openai/agent-badge (agent-badge)
Scanned Sessions: 3
Deduped Sessions: 3
Override Actions Applied:
- codex:ambiguous-session => include

Included Totals
- Combined: 1 sessions, 120 tokens
- codex: 1 sessions, 120 tokens
- claude: 0 sessions, 0 tokens
- Counts: included=1, ambiguous=1, excluded=1

Ambiguous Sessions
- codex:ambiguous-session | provider=codex | evidence=normalized-cwd | reason=Ambiguous because only weak evidence matched the current repo

Excluded Sessions
- claude:excluded-session | provider=claude | evidence=transcript-correlation | reason=Excluded because no attribution evidence matched the current repo
```

## `publish`

```bash
agent-badge publish
```

Publishes aggregate badge JSON to the configured gist target immediately. Use this when you want a direct publish instead of waiting for `refresh`.

If the gist is not configured yet, the command exits with:

```text
Publish is not configured. Run `agent-badge init` or re-run init with `--gist-id <id>` first.
```

## `refresh`

```bash
agent-badge refresh [--hook pre-push] [--hook-policy <fail-soft|strict>] [--fail-soft] [--force-full]
```

| Option | Meaning |
| --- | --- |
| `--hook pre-push` | Run refresh in the supported hook mode. |
| `--hook-policy <fail-soft|strict>` | Force the hook behavior explicitly. |
| `--fail-soft` | Return a structured soft failure instead of throwing. |
| `--force-full` | Ignore incremental cache state and rebuild from a full scan. |

Notes:

- `--fail-soft` cannot be combined with `--hook-policy strict`
- the managed pre-push hook uses `agent-badge refresh --hook pre-push --hook-policy fail-soft` by default

When a stale publish is repaired successfully, refresh reports:

```text
- Recovery result: healthy after agent-badge refresh
```

## `status`

```bash
agent-badge status
```

Representative healthy output:

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

## `doctor`

```bash
agent-badge doctor [--json] [--probe-write]
```

| Option | Meaning |
| --- | --- |
| `--json` | Emit the full machine-readable result object. |
| `--probe-write` | Validate gist write credentials with a no-op update. |

Use `--json` for automation and `--probe-write` when auth looks present but publish still fails.

## `config`

```bash
agent-badge config
agent-badge config get [key]
agent-badge config set <key> <value>
```

Supported keys live in [CONFIGURATION.md](CONFIGURATION.md).

Examples:

```bash
agent-badge config get badge.mode
agent-badge config set badge.mode tokens
agent-badge config set refresh.prePush.mode strict
```

## `uninstall`

```bash
agent-badge uninstall [--purge-remote] [--purge-config] [--purge-state] [--purge-logs] [--purge-cache] [--force]
```

| Option | Meaning |
| --- | --- |
| `--purge-remote` | Delete the configured gist and clear the local gist association. |
| `--purge-config` | Delete `.agent-badge/config.json`. |
| `--purge-state` | Delete `.agent-badge/state.json`. |
| `--purge-logs` | Delete `.agent-badge/logs`. Enabled by default. |
| `--purge-cache` | Delete `.agent-badge/cache`. Enabled by default. |
| `--force` | Preserve progress by ignoring non-fatal cleanup failures. |

Default uninstall behavior is conservative:

```text
- uninstall: start
- default: preserve config/state/remote unless purge flags are set
- remote: preserved
```

Use [UNINSTALL.md](UNINSTALL.md) for rollback-oriented guidance.
