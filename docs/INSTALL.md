# Install

`agent-badge` is npm-initializer-first. The default path is a shared runtime with minimal repo artifacts, and explicit package installation stays available as an alternative.

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

- creates `.agent-badge/config.json` and `.agent-badge/state.json`
- updates `.gitignore` for state, cache, and logs
- wires a failure-soft `pre-push` refresh hook
- inserts the badge into `README.md` once a stable badge URL is available
- does not install repo-local `@legotin/agent-badge`, managed `agent-badge:init` / `agent-badge:refresh` scripts, or repo-local `node_modules` by default

When GitHub auth is available and the shared runtime is already on `PATH`, init can finish with:

```text
- Publish target: created public gist
- Setup: complete. Shared runtime, pre-push refresh, and live badge publishing are ready.
```

If GitHub auth is not available yet, init finishes with:

```text
- Publish target: deferred
- Badge setup deferred: set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT to create a public gist automatically, or rerun `agent-badge init --gist-id <id>` to connect an existing public gist.
- Setup: repo setup complete, but GitHub auth is still required before the live badge can publish. Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT, then rerun `agent-badge init` or connect a public gist with `agent-badge init --gist-id <id>`.
```

If the shared runtime is not on `PATH` yet, install it once globally or user-scoped, or choose the direct package-install path below.

## Alternative: Direct Runtime Install

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
- `@legotin/agent-badge` is the shared runtime CLI package when you want an explicit install path
- `@legotin/agent-badge-core` is the published internal library used by the runtime

That split is normal npm initializer behavior. You should expect `create-agent-badge` in `npm init` logs. You should only expect `@legotin/agent-badge` in repo dependencies when you choose the direct install path.

## After Install

Check the current state:

```bash
agent-badge status
```

If publish was deferred, follow [Authentication](AUTH.md) and rerun:

```bash
agent-badge init
```

If you want the full command reference next, use [CLI.md](CLI.md).
