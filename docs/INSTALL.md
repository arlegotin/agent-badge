# Install

`agent-badge` is npm-initializer-first, but the runtime works with other package managers after install.

## Requirements

| Requirement | Supported | Why it matters |
| --- | --- | --- |
| Node.js | `20.x`, `22.x`, `24.x` | The runtime and initializer are tested in CI on these release lines. |
| Git repository | required | `agent-badge init` expects to run inside a repo. |
| Local provider data | `~/.codex` and/or `~/.claude` | The badge only reflects providers that exist on the current machine. |
| GitHub auth | optional for local setup, required for live publish | Without auth, init finishes locally and defers gist publishing. |
| Public GitHub Gist | required for live publish | The stable badge URL is backed by a public gist you own. |

If neither `~/.codex` nor `~/.claude` exists, install still succeeds, but the badge will not report meaningful usage until provider data appears.

## Fastest Path

```bash
npm init agent-badge@latest
```

That initializer:

- installs `@legotin/agent-badge` in the current repo
- creates `.agent-badge/config.json` and `.agent-badge/state.json`
- adds managed `agent-badge:init` and `agent-badge:refresh` package scripts
- wires a failure-soft `pre-push` refresh hook
- inserts the badge into `README.md` once a stable badge URL is available

If GitHub auth is already available, init finishes with:

```text
- Publish target: created public gist
- Setup: complete. Local runtime, pre-push refresh, and live badge publishing are ready.
```

If GitHub auth is not available yet, init finishes with:

```text
- Publish target: deferred
- Badge setup deferred: set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT to create a public gist automatically, or rerun `agent-badge init --gist-id <id>` to connect an existing public gist.
- Setup: local setup complete, but GitHub auth is still required before the live badge can publish. Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT, then rerun `agent-badge init` or connect a public gist with `agent-badge init --gist-id <id>`.
```

## Direct Runtime Install

If you do not want the initializer, install `@legotin/agent-badge` directly and run `init` yourself.

| Package manager | Install | Run the CLI |
| --- | --- | --- |
| npm | `npm install -D @legotin/agent-badge` | `npx --no-install agent-badge init` |
| pnpm | `pnpm add -D @legotin/agent-badge` | `pnpm exec agent-badge init` |
| yarn | `yarn add -D @legotin/agent-badge` | `yarn agent-badge init` |
| bun | `bun add -d @legotin/agent-badge` | `bunx --bun agent-badge init` |

The runtime detects the repo package manager and writes the managed `pre-push` hook accordingly.

## Package Names

The npm package names are intentionally split:

- `npm init agent-badge@latest` resolves to `create-agent-badge`
- `@legotin/agent-badge` is the repo-local runtime CLI
- `@legotin/agent-badge-core` is the published internal library used by the runtime

That split is normal npm initializer behavior. You should expect `create-agent-badge` in `npm init` logs and `@legotin/agent-badge` in the repo's installed dependencies.

## After Install

Check the current state:

```bash
npx --no-install agent-badge status
```

If publish was deferred, follow [Authentication](AUTH.md) and rerun:

```bash
npx --no-install agent-badge init
```

If you want the full command reference next, use [CLI.md](CLI.md).
