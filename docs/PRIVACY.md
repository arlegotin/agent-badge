# Privacy

Collection runs locally where the agent writes history. CI cannot discover another machine's local usage. No prompts, transcripts, agent-work filenames, local paths, credentials or raw provider session IDs are committed or transmitted by Badge.

Private state under `<git-common-dir>/agent-badge/` includes discovery descriptors, normalized observations, attribution choices/proof, checkpoints, journals, fixed causal-control intents, leases and accepted snapshot evidence. It may identify local sources, so protect it like other local development data. It never belongs in a PR. Retained unsupported v1 state/cache/log files remain ignored during uninstall.

Outbound data is strictly validated: opaque repository-scoped unit/coverage hashes, allowlisted provider/model/meter values, repository UUID, schema versions, causal controls, supported catalog/policy and derived artifacts. Git data commits use a fixed non-personal identity/message; captured Git/provider errors become static diagnostic codes. Hashes provide integrity and stable identity, not proof that a writer's self-reported usage is true.

`status` is local and sends nothing. `explain` is redacted and local only. Explicit public `contribute` files are the deliberate normal-staging exception: they contain validated public receipts and causal closure, never private source envelopes. `import --normalized-source` is private and uses a distinct strict discriminator. Exporting or uploading a raw native history is unnecessary and unsafe.

Normal Git authentication remains Git's responsibility. The optional trusted workflow imports accepted sanitized files with exact approved code; it cannot collect a developer's private history. No background service, credential probing, analytics or per-person leaderboard is installed.

[Security](../SECURITY.md) · [Attribution](ATTRIBUTION.md) · [Uninstall](UNINSTALL.md).
