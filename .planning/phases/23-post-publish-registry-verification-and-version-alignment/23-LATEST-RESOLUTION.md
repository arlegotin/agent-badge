## Registry view

`npm view @legotin/agent-badge version dist-tags.latest --json`
```json
{
  "version": "1.1.3",
  "dist-tags.latest": "1.1.3"
}
```

`npm view @legotin/agent-badge-core version dist-tags.latest --json`
```json
{
  "version": "1.1.3",
  "dist-tags.latest": "1.1.3"
}
```

`npm view create-agent-badge version dist-tags.latest --json`
```json
{
  "version": "1.1.3",
  "dist-tags.latest": "1.1.3"
}
```

All three `dist-tags.latest` values are `1.1.3`: yes.

## Latest initializer run

Command: `npm init agent-badge@latest`

- Exit code: `0`
- `.agent-badge/config.json` created: yes
- `.agent-badge/state.json` created: yes
- `.git/hooks/pre-push` created: yes
- `Badge setup deferred` observed in captured output: yes

## Outcome

Latest alias passed at 1.1.3
