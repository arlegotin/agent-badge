# Authentication

`agent-badge` writes badge payloads to a GitHub Gist, so GitHub auth must be able to create, update, and delete gists on your account.

## Accepted Auth Sources

The CLI checks auth in this order:

1. `GH_TOKEN`
2. `GITHUB_TOKEN`
3. `GITHUB_PAT`
4. `gh auth token`

If one of those resolves to a valid token, init can create or reuse a gist automatically.

## Required Token Permissions

Use one of these token shapes:

- Classic personal access token: `gist` scope
- Fine-grained personal access token: `Gists` user permission with `write`
- GitHub CLI auth: whatever `gh auth token` returns must be able to write gists

`agent-badge` does not need repository write access to publish badge JSON. It needs gist write access.

## Gist Ownership Rules

The configured gist must be:

- public
- owned by the authenticated account
- reachable through the GitHub API

If you connect a gist manually, use:

```bash
agent-badge init --gist-id <id>
```

## Common Setup Paths

Use a token from the shell:

```bash
export GH_TOKEN=<token>
npx --no-install agent-badge init
```

Or authenticate GitHub CLI and let `agent-badge` resolve the token through `gh auth token`:

```bash
gh auth login
npx --no-install agent-badge init
```

## Common Messages

If auth is missing during init:

```text
- Publish target: deferred
- Setup: local setup complete, but GitHub auth is still required before the live badge can publish.
```

If a later publish attempt cannot authenticate:

```text
GitHub authentication missing or invalid.
```

If the repo has no configured gist yet:

```text
Publish is not configured. Run `agent-badge init` or re-run init with `--gist-id <id>` first.
```

## Verify Auth Before Publishing

These checks are useful before you rerun init or publish:

```bash
gh auth status
gh auth token >/dev/null
agent-badge doctor --probe-write
```

`doctor --probe-write` is the strongest check because it validates the configured gist path, not just token presence.

If auth still looks wrong, use [Troubleshooting](TROUBLESHOOTING.md) and [Manual Gist Connection](MANUAL-GIST.md).
