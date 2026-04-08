# FAQ

## Why does `npm init agent-badge@latest` mention `create-agent-badge`?

Because npm initializers are published as `create-*` packages. `npm init agent-badge@latest` resolves to `create-agent-badge`, which then installs the actual runtime package `@legotin/agent-badge`.

## What if I only use Codex or only use Claude?

That is supported. `agent-badge` scans whichever provider directories exist on the current machine. If one provider is missing, the CLI reports partial coverage instead of inventing data.

## Does install fail if GitHub auth is missing?

No. Local setup still completes. Live gist publishing is deferred until auth is available.

## What gets uploaded?

Aggregate badge payloads and shared metadata only. No prompt text, transcript text, filenames, or local paths are published.

## Can I use pnpm, yarn, or bun?

Yes for the runtime. Use npm for the one-step initializer, or install `@legotin/agent-badge` directly and run the local wrapper for your package manager. See [INSTALL.md](INSTALL.md).

## What if neither `~/.codex` nor `~/.claude` exists?

The CLI can still install itself, but the badge will not reflect meaningful usage until at least one supported provider directory exists on that machine.

## Where is the single source of truth for commands and flags?

Use [CLI.md](CLI.md). It covers every command exposed by the current CLI surface.

## How do I move an existing badge to a new machine?

Reconnect the existing public gist with:

```bash
agent-badge init --gist-id <id>
```

For shared-publish continuity and migration edge cases, use [MANUAL-GIST.md](MANUAL-GIST.md) and [RECOVERY.md](RECOVERY.md).
