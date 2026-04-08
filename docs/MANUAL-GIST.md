# Manual Gist Connection

Use this flow when automatic gist creation is unavailable or you want to reuse an existing public gist.

Commands below are shown as `agent-badge ...` for readability. In an npm-initialized repo, run them as `npx --no-install agent-badge ...` unless the binary is already on your `PATH`.

For the full supported recovery matrix, including stale after failed publish and shared-state repair, use [RECOVERY.md](RECOVERY.md) as the canonical runbook.

## Reconnect with an Existing Gist

1. Create or choose a public gist in your GitHub account.
2. Copy the gist id from the gist URL.
3. Run:

```bash
agent-badge init --gist-id <id>
```

4. Confirm setup with:

```bash
agent-badge status
```

The gist must be public and owned by the same authenticated account that the CLI is using. See [AUTH.md](AUTH.md) if you need the exact token requirements.

If the repo already has local `agent-badge` state, rerunning init is safe. The command is designed to reuse existing scaffold and reconnect publish state instead of duplicating badge markers or hook blocks.

If you need to migrate existing single-writer repos, run the reconnecting `agent-badge init --gist-id <id>` command on the original publisher machine first. That preserves the same gist id and badge URL while seeding the first shared contributor publish from the machine that already has the repo's trusted local history.

## Post-Migration Verification

After reconnecting or migrating, verify the shared publish state before other contributors publish:

```bash
agent-badge status
agent-badge doctor
```

`agent-badge status` should show the shared mode summary, and `agent-badge doctor` should confirm that `shared-mode` and `shared-health` are not blocked.

If either command still shows a `Recovery path`, return to [RECOVERY.md](RECOVERY.md) and follow the exact supported command it surfaces.

## Expected Badge URL Format

After a successful connection, badge URLs should follow this pattern:

`https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2F<owner>%2F<gist-id>%2Fraw%2Fagent-badge.json&cacheSeconds=<cache-seconds>[&style=<badge-style>]`

By default `cache-seconds` is `300`, but it follows your configured `badge.cacheSeconds` value. `style` is omitted for the default `flat` style and appears only when you configure another supported Shields style.
