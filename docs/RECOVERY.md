# Recovery Runbook

This is the canonical operator runbook for publish failures and shared-state repair.

Commands below are shown as `agent-badge ...` for readability. Use them directly when the shared runtime is on your `PATH`. If you chose the direct package-install path instead, use the matching package manager exec form from [INSTALL.md](INSTALL.md).

## Read The Signals First

Use these read-only commands before you repair anything:

```bash
agent-badge status
agent-badge doctor
```

Look for the exact recovery wording in `- Recovery:` or `Recovery path:`.

## Symptom Map

| Symptom | Recovery path | Notes |
| --- | --- | --- |
| `Live badge trust: stale after failed publish` | `agent-badge refresh` | Restore GitHub auth first if auth is missing. |
| Missing or broken gist target | `agent-badge init --gist-id <id>` | Use a valid public gist. |
| `missing-local-contributor` / orphaned local publisher | `agent-badge refresh` | Recreates the local contributor record in shared mode. |
| Partial shared metadata / missing shared overrides | `agent-badge init` | Repairs shared publish metadata on the existing gist. |
| Stale contributors, conflicting observations, or original-publisher migration | team coordination | Other contributors, or the original publisher machine, must run the supported command. |

## stale after failed publish

Typical signals:

- `agent-badge status` shows `Live badge trust: stale after failed publish`
- `agent-badge status` shows `- Recovery: Restore GitHub auth, then run agent-badge refresh`
- `agent-badge doctor` shows the same `Recovery path`

Recovery path:

1. Restore GitHub auth in the shell where you are running the CLI.
2. Run:

```bash
agent-badge refresh
```

3. Verify the repo is healthy again:

```bash
agent-badge status
agent-badge doctor
```

Expected healthy result:

- `Shared mode: shared | health=healthy`
- no stale publish warning
- no follow-up recovery line for the same issue

## Gist Target Repair

Recovery path:

```bash
agent-badge init --gist-id <id>
```

Use a public gist that you own. Re-run `agent-badge status` afterward to confirm the publish target is connected.

## missing local contributor

Recovery path:

```bash
agent-badge refresh
```

This recreates the current machine's shared contributor file without manual edits to `.agent-badge/state.json`.

## Partial Shared Metadata

Recovery path:

```bash
agent-badge init
```

That reruns the supported metadata repair flow on the existing gist and should bring shared mode back to a healthy state.

## Team Coordination States

### stale contributors

Recovery path:

- Ask stale contributors to run `agent-badge refresh` on their machines.

### conflicting observations

Recovery path:

- Ask the contributors who recently published to rerun `agent-badge refresh`.
- Re-run `agent-badge doctor` after they publish again.

### original-publisher migration

Recovery path:

- Run `agent-badge init` on the original publisher machine first.

That preserves the existing gist-backed badge URL while seeding shared contributor state from the machine that already has the trusted local history.
