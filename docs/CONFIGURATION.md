# Configuration

`agent-badge` keeps configuration intentionally narrow. The goal is a trustworthy badge, not an analytics maze.

Commands below are shown as `agent-badge ...` for readability. In an npm-initialized repo, run them as `npx --no-install agent-badge ...` unless the binary is already on your `PATH`.

## Supported Keys

Use `agent-badge config` or `agent-badge config get` to inspect current values, and `agent-badge config set <key> <value>` to change them.

| Key | Values | Default | What it changes |
| --- | --- | --- | --- |
| `providers.codex.enabled` | `true`, `false` | `true` | Include or ignore Codex data during scan and refresh. |
| `providers.claude.enabled` | `true`, `false` | `true` | Include or ignore Claude data during scan and refresh. |
| `badge.label` | any non-empty string | `Vibe budget` | Changes the left-side badge label. |
| `badge.mode` | `combined`, `tokens`, `cost` | `combined` | Changes what the badge message displays. |
| `refresh.prePush.enabled` | `true`, `false` | `true` | Enables or removes the managed `pre-push` refresh hook block. |
| `refresh.prePush.mode` | `fail-soft`, `strict` | `fail-soft` | Controls whether hook refresh failures are tolerated or fail the push. |
| `privacy.output` | `standard`, `minimal` | `standard` | Controls how much publish detail CLI commands print locally. |
| `privacy.aggregateOnly` | `true` | `true` | Fixed safety guard. It can be read, but it cannot be disabled. |

## Common Configurations

### Default "show the receipt" badge

```bash
agent-badge config set badge.mode combined
```

Shows tokens and estimated USD together.

### Tokens only

```bash
agent-badge config set badge.mode tokens
```

Useful when you want the usage signal without the pricing layer.

### Cost only

```bash
agent-badge config set badge.mode cost
```

Useful when the headline is "what did this repo consume?"

### Keep the default label

```bash
agent-badge config set badge.label "Vibe budget"
```

### Set the label to AI Receipt

```bash
agent-badge config set badge.label "AI Receipt"
```

### Codex-only or Claude-only tracking

```bash
agent-badge config set providers.claude.enabled false
agent-badge config set providers.codex.enabled false
```

Disable the provider you do not want included.

### Turn off push-time refresh

```bash
agent-badge config set refresh.prePush.enabled false
```

The runtime stays installed, but the managed hook block is removed.

### Make pushes strict

```bash
agent-badge config set refresh.prePush.mode strict
```

In strict mode, a refresh failure can block the push instead of failing softly.

### Reduce local status detail

```bash
agent-badge config set privacy.output minimal
```

This only changes CLI output. The publish model stays aggregate-only.

## What You Cannot Change With `config`

These are not supported through `agent-badge config set` today:

- publish target fields such as `publish.gistId`
- raw-data publishing behavior
- provider-specific scan internals

To connect or reconnect a gist, rerun:

```bash
agent-badge init --gist-id <id>
```
