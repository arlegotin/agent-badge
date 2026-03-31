# Troubleshooting

## non-git directory

Symptom: init reports that the current folder is not a repository.

Recovery:

1. Run `agent-badge init --allow-git-init` to let the tool bootstrap git.
2. Or run `git init` yourself, then rerun `agent-badge init`.

## no GitHub auth

Symptom: publish target creation is deferred because authentication is unavailable.

Recovery:

1. Export one of `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT`.
2. Rerun `agent-badge init` or `agent-badge publish`.

## deferred publish target

Symptom: init shows `Publish target: deferred` and badge setup does not complete.

Recovery:

1. Connect an existing public gist with `agent-badge init --gist-id <id>`.
2. Confirm the gist is public and owned by the authenticated account.
3. Run `agent-badge status` to verify publish target state.

## provider directory not found

Symptom: scan or refresh reports missing provider data roots.

Recovery:

1. Check whether `~/.codex` or `~/.claude` exists on this machine.
2. Disable unavailable providers via `agent-badge config` until data appears.
3. Run `agent-badge doctor` for targeted remediation guidance.
