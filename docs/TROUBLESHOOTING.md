# Troubleshooting

Commands below are shown as `agent-badge ...` for readability. Use them directly when the shared runtime is on your `PATH`. If you intentionally chose the direct package-install path, use your package manager's exec wrapper instead.

The canonical supported repair flow lives in [RECOVERY.md](RECOVERY.md). This page stays focused on symptoms and short triage notes.

## command not found after init

Symptom: the repo was initialized, but your shell does not recognize `agent-badge`.

Recovery:

1. Treat this as a machine-level runtime issue, not a missing repo scaffold issue.
2. Install or repair the shared runtime so `agent-badge` resolves on `PATH`.
3. Retry `agent-badge <command>` in the repo you already initialized.
4. If you intentionally installed `@legotin/agent-badge` inside the repo instead, use `npx --no-install agent-badge <command>`, `pnpm exec agent-badge <command>`, `yarn agent-badge <command>`, or `bunx --bun agent-badge <command>`.

## shared runtime could not be validated

Symptom: init prints `Shared runtime: unavailable` and setup ends with `shared runtime could not be validated`.

Recovery:

1. Machine fix: reinstall or upgrade the shared runtime with `npm install -g @legotin/agent-badge@latest` (or `pnpm add -g` / `bun add -g`).
2. Machine fix: refresh shell command cache with `hash -r`.
3. Machine fix: confirm the runtime probe command works with `agent-badge --version`.
4. Repo follow-up: re-run `agent-badge doctor`, then rerun `agent-badge init` if doctor still reports hook or runtime issues for the current repo.

If `agent-badge --version` fails, your shell is still resolving an old or broken runtime path. Fix `PATH`, then retry.

## git bootstrap blocked

Symptom: init stops before writing `.agent-badge/` because repository bootstrap is blocked.

Recovery:

1. Run `git init` in the target directory.
2. Make sure the directory is writable and not otherwise restricted.
3. Rerun `agent-badge init`.

## no GitHub auth

Symptom: publish target creation is deferred because authentication is unavailable.

Recovery:

1. Treat this as shell or machine auth state, not a repo wiring failure.
2. Export one of `GH_TOKEN`, `GITHUB_TOKEN`, or `GITHUB_PAT`, or authenticate with `gh auth login` so `gh auth token` works in the same environment.
3. Rerun `agent-badge init`, or connect a public gist with `agent-badge init --gist-id <id>`.

Use [AUTH.md](AUTH.md) if you need the exact token requirements.

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

`agent-badge` only scans those provider directories today. If both are missing, install can still succeed, but the badge will not reflect meaningful usage yet.

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
2. If `status` says `stale after failed publish`, follow the `agent-badge refresh` recovery path in [RECOVERY.md](RECOVERY.md).
3. Remember the Shields endpoint is cached. By default the badge URL uses `cacheSeconds=300`, but your repo may use a different value if `badge.cacheSeconds` was customized.

## shared mode is stale

Symptom: `agent-badge status` shows `Shared mode: shared | health=stale`, or `agent-badge doctor` warns that shared mode is stale.

Recovery:

1. Follow the team-coordination stale contributor flow in [RECOVERY.md](RECOVERY.md).
2. Re-run `agent-badge status` to confirm the shared contributor count is still correct and the health moved back to healthy.
3. Run `agent-badge doctor` if stale warnings remain after refresh.

## shared mode reports conflicts

Symptom: `agent-badge doctor` fails with `shared-health` conflict guidance, or `agent-badge status` prints `Shared issues: conflicting-session-observations=...`.

Recovery:

1. Follow the conflicting-observation flow in [RECOVERY.md](RECOVERY.md).
2. Re-run `agent-badge doctor` to confirm the conflict is gone.
3. If the repo was never migrated cleanly, rerun `agent-badge init` on the original publisher machine before resuming normal team publishing.

## shared mode is partially migrated

Symptom: `agent-badge doctor` reports partial shared mode or missing shared metadata.

Recovery:

1. Follow the partial shared metadata recovery path in [RECOVERY.md](RECOVERY.md).
2. Run `agent-badge status` and `agent-badge doctor` to confirm the repo now reports shared mode cleanly.
3. If continuity still looks wrong, repeat the migration from the original publisher machine that already has the trusted local history.

## orphaned local publisher

Symptom: `agent-badge status` reports `missing-local-contributor`, or `agent-badge doctor` reports an orphaned local publisher.

Recovery:

1. Follow the missing local contributor recovery path in [RECOVERY.md](RECOVERY.md).
2. Re-run `agent-badge status` to confirm the shared issues line clears.
3. If the repo is still migrating from legacy mode, rerun `agent-badge init` on the original publisher machine and verify again with `agent-badge doctor`.
