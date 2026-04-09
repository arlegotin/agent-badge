# Uninstall

`agent-badge uninstall` removes repo wiring first and preserves data unless you explicitly ask it to purge more.

Commands below are shown as `agent-badge ...` for readability. Use them directly when the shared runtime is on your `PATH`. If you chose the direct package-install path instead, use the matching package manager exec form from [INSTALL.md](INSTALL.md).

## Default Behavior

Run:

```bash
agent-badge uninstall
```

Default output starts with:

```text
- uninstall: start
- default: preserve config/state/remote unless purge flags are set
- remote: preserved
```

By default, uninstall:

- removes managed package scripts and the managed pre-push hook block
- preserves `.agent-badge/config.json`
- preserves `.agent-badge/state.json`
- preserves the remote gist association
- removes local logs and cache

That default makes rollback easy because you can reinstall without losing local publish state.

## Full Local Purge

Remove runtime wiring and local state:

```bash
agent-badge uninstall --purge-config --purge-state --purge-logs --purge-cache
```

## Remote Gist Purge

Delete the configured publish gist too:

```bash
agent-badge uninstall --purge-remote
```

Use this carefully. It deletes the gist, not just the local pointer to it.

## Reinstall

To reinstall after a default uninstall:

```bash
agent-badge init
```

To reinstall after a full local purge:

```bash
npm init agent-badge@latest
```

If you preserved the gist, init reconnects to it. If you deleted the gist, auth or `--gist-id <id>` is required again.
