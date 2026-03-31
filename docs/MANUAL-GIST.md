# Manual Gist Connection

Use this flow when automatic gist creation is unavailable or you want to reuse an existing public gist.

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

## Expected Badge URL Format

After a successful connection, badge URLs should follow this pattern:

`https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2F<owner>%2F<gist-id>%2Fraw%2Fagent-badge.json&cacheSeconds=300`
