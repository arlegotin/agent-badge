# Configuration

The shared authority is accepted data-branch `meta.json` and `catalog.json`. The tracked `.agent-badge/config.json` declares the repository UUID, destination, protocol and policy for setup; stale branches cannot silently roll back accepted policy. A pending private configuration record expresses uncertainty, not proof the remote accepted a requested edit.

Private activation is `<git-common-dir>/agent-badge/local.json`. It contains approved runtime/binding, local roots, attribution choices and worktree inventory. Do not copy it into tracked files. Setup preserves private choices and requires explicit approval of changed exact runtime locks. Independent clones need their own activation.

`configure --from-file` accepts one strict JSON request:

```json
{"schemaVersion":1,"expectedMetadataRevision":"<64-hex-current-meta-revision>","meta":{"schemaVersion":2,"protocolVersion":1,"repositoryId":"<repository-uuid>","normalizationVersion":1,"catalogVersion":1,"catalogHash":"<64-hex-catalog-hash>","policy":"<full-supported-policy-object>"},"catalog":"<full-supported-catalog-object>"}
```

The placeholders describe structure, not valid import data. Use `status --json` for the accepted `metadataRevision`; obtain validated current metadata/catalog from the reported accepted commit or core API. never invent a revision. Policy includes `schemaVersion:1`, repository UUID, `normalizationVersion:1`, discovery, disabled providers and badge label/metric. Catalogs use supported strict model/rate-card schemas; unsupported contracts are rejected. Changes use revision compare-and-swap. A stale request conflicts even if its desired label equals the winning edit.

After remote acceptance, the owning writer atomically repairs the local declaration. If that write fails, report drift and preserve repair evidence; do not roll back accepted metadata. Explicit setup repairs from accepted authority. A runtime upgrade requires `upgrade --runtime-version <exact-version>`; optional `--from-file` applies the same deliberate metadata/catalog protocol.

[Attribution](ATTRIBUTION.md) · [CLI](CLI.md) · [Recovery](RECOVERY.md).
