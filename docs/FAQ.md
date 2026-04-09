# FAQ

## Why does `npm init agent-badge@latest` mention `create-agent-badge`?

Because npm initializers are published as `create-*` packages. `npm init agent-badge@latest` resolves to `create-agent-badge`, which is a thin initializer entrypoint that runs `agent-badge init` for the current repo.

## What if I only use Codex or only use Claude?

That is supported. `agent-badge` scans whichever provider directories exist on the current machine. If one provider is missing, the CLI reports partial coverage instead of inventing data.

## Does install fail if GitHub auth is missing?

No. Local setup still completes. Live gist publishing is deferred until auth is available.

## Why did init say `Shared runtime: unavailable`?

That means the shared CLI is not currently callable from your shell `PATH`, or the installed binary is broken. Install or upgrade `@legotin/agent-badge` globally, run `hash -r`, verify `agent-badge --version`, then rerun `agent-badge init` or `agent-badge doctor`.

## What gets uploaded?

Aggregate badge payloads and shared metadata only. No prompt text, transcript text, filenames, or local paths are published.

## Can I use pnpm, yarn, or bun?

Yes for the runtime. Use npm for the one-step initializer, or install `@legotin/agent-badge` directly and use that package manager's exec form. See [INSTALL.md](INSTALL.md).

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
