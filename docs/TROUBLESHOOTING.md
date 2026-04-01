# Troubleshooting

Commands below are shown as `agent-badge ...` for readability. In an npm-initialized repo, run them as `npx --no-install agent-badge ...` unless the binary is already on your `PATH`.

## command not found after init

Symptom: the repo was initialized, but your shell does not recognize `agent-badge`.

Recovery:

1. For npm projects, run `npx --no-install agent-badge <command>`.
2. For pnpm, run `pnpm exec agent-badge <command>`.
3. For yarn, run `yarn agent-badge <command>`.
4. For bun, run `bunx --bun agent-badge <command>`.

## git bootstrap blocked

Symptom: init stops before writing `.agent-badge/` because repository bootstrap is blocked.

Recovery:

1. Run `git init` in the target directory.
2. Make sure the directory is writable and not otherwise restricted.
3. Rerun `agent-badge init`.

## no GitHub auth

Symptom: publish target creation is deferred because authentication is unavailable.

Recovery:

1. Export one of `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT`.
2. Rerun `agent-badge init`, or connect a public gist with `agent-badge init --gist-id <id>`.

## deferred publish target

Symptom: init shows `Publish target: deferred` and badge setup does not complete.

Recovery:

1. Connect an existing public gist with `agent-badge init --gist-id <id>`.
2. Confirm the gist is public and owned by the authenticated account.
3. Run `agent-badge status` to verify publish target state.

## publish is not configured

Symptom: `agent-badge publish` fails and tells you publish is not configured.

Recovery:

1. Run `agent-badge status` and confirm gist wiring is missing or deferred.
2. Reconnect with `agent-badge init --gist-id <id>`, or export GitHub auth and rerun `agent-badge init`.
3. Retry `agent-badge publish` or `agent-badge refresh`.

## provider directory not found

Symptom: scan or refresh reports missing provider data roots.

Recovery:

1. Check whether `~/.codex` or `~/.claude` exists on this machine.
2. Disable unavailable providers via `agent-badge config` until data appears.
3. Run `agent-badge doctor` for targeted remediation guidance.

## ambiguous sessions are not counted

Symptom: a session you expected to count shows up as ambiguous in `agent-badge scan`.

Recovery:

1. Review the ambiguous session ids in the scan output.
2. Re-run the scan with `--include-session <provider:sessionId>` or `--exclude-session <provider:sessionId>`.
3. Re-run `agent-badge refresh` after resolving the ambiguity if you want the badge updated.

## badge looks stale after a push

Symptom: the README badge still shows the old number right after refresh or push.

Recovery:

1. Run `agent-badge status` and confirm a recent refresh happened.
2. Run `agent-badge refresh` manually to force the local refresh path.
3. Remember the Shields endpoint uses `cacheSeconds=300`, so a short delay is expected.
