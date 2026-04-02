# Privacy Model

## Aggregate-only publishing

`agent-badge` keeps the badge endpoint payload aggregate-only even when shared publishing is enabled. The public gist may contain derived badge payloads, deterministic contributor files such as `agent-badge-contrib-<publisher>.json`, and the shared overrides file `agent-badge-overrides.json`, but those shared-state files still never publish prompt text, transcript text, filenames, or local paths.

Diagnostics stay aggregate-only. When `agent-badge status` or `agent-badge doctor` reports stale shared mode, conflicts, partial migration, or an orphaned local publisher, the CLI reports only mode, issue ids, counts, and remediation guidance. It does not print raw session ids, raw `provider:providerSessionId` values, prompt text, transcript text, filenames, or local paths.

## Forbidden Outbound Data

The following data must never leave the local machine:

- prompt text
- raw transcript content
- filename
- local paths
- raw `provider:providerSessionId` values

## Local-First Boundary

- Provider scanning runs against local `~/.codex` and `~/.claude` directories.
- Attribution and override decisions are persisted locally in `.agent-badge/`.
- Remote publishing writes aggregate endpoint JSON for Shields plus shared-state files that use opaque digest keys instead of raw provider session ids.

## Local Artifacts

The runtime keeps small derived state in the repo:

- `.agent-badge/config.json` for supported settings
- `.agent-badge/state.json` for publish state, checkpoints, and persisted override decisions
- `.agent-badge/cache/` for refresh acceleration
- `.agent-badge/logs/` for local operational logs

By default, init adds the mutable state, cache, and logs paths to `.gitignore`.

## CLI Output Privacy

`privacy.output` can be set to `standard` or `minimal`:

- `standard` prints more local publish detail such as gist id and publish hash where available
- `minimal` trims that local output down

This only changes what the CLI prints on your machine. It does not relax the aggregate-only publish boundary.
