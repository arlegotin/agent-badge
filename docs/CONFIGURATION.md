# Configuration

`agent-badge` keeps configuration intentionally narrow. The goal is a trustworthy badge, not an analytics maze.

Commands below are shown as `agent-badge ...` for readability. Use them directly when the shared runtime is on your `PATH`. If you chose the direct package-install alternative, use your package manager's exec wrapper instead.

## Supported Keys

Use `agent-badge config` or `agent-badge config get` to inspect current values, and `agent-badge config set <key> <value>` to change them.

| Key | Values | Default | What it changes |
| --- | --- | --- | --- |
| `providers.codex.enabled` | `true`, `false` | `true` | Include or ignore Codex data during scan and refresh. |
| `providers.claude.enabled` | `true`, `false` | `true` | Include or ignore Claude data during scan and refresh. |
| `badge.label` | any non-empty string | `AI burn` | Changes the left-side badge label. |
| `badge.mode` | `combined`, `tokens`, `cost` | `combined` | Changes what the badge message displays. |
| `badge.style` | `flat`, `flat-square`, `plastic`, `for-the-badge`, `social` | `flat` | Changes the Shields badge style embedded in the stable badge URL. |
| `badge.color` | any non-empty Shields color string | `#E8A515` | Changes the badge color when the selected total is non-zero. |
| `badge.colorZero` | any non-empty Shields color string | `lightgrey` | Changes the badge color when the selected total is zero. |
| `badge.cacheSeconds` | positive integer | `300` | Changes the Shields cache hint embedded in the stable badge URL. |
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
agent-badge config set badge.label "AI burn"
```

### Set the label to AI Receipt

```bash
agent-badge config set badge.label "AI Receipt"
```

Other gallery examples rotate through `AI spent`, `AI Spend`, and `AI Bill` when you want a more opinionated label.

### Change the badge style

```bash
agent-badge config set badge.style for-the-badge
```

Supported values: `flat`, `flat-square`, `plastic`, `for-the-badge`, `social`.

### Change the badge colors

```bash
agent-badge config set badge.color orange
agent-badge config set badge.colorZero silver
```

These values are passed through to Shields-compatible badge colors. The new color appears after the next successful publish or refresh.
Examples: `orange`, `teal`, `royalblue`, `#ff69b4`, `#2ea44f`.

### Change the Shields cache time

```bash
agent-badge config set badge.cacheSeconds 900
```

This updates the stored badge URL to use a different `cacheSeconds` value. The default is `300`.

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
The shared runtime stays available; only the managed hook block is removed.

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
