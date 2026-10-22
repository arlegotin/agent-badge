# Recovery

Start with local `status --json` and `doctor --json`. Inspect static states, accepted commit, queue and actual declaration drift. `doctor --remote` explicitly opts into bounded remote reads; it proves neither write permission nor hosted image rendering. Do not delete private state as a first repair.

Offline or failed sync retains local usage. Retry `sync` after normal Git authentication/routing is repaired; use `collect --full` for explicit historical reconciliation. Automatic wakeups have a two-second total budget and can leave cold/large/incomplete work pending. Unknown coverage is not proof that a scan completed.

A missing/replaced `agent-badge/data` after accepted-history evidence is a conflict, not permission to initialize again. Preserve private accepted anchors, journals and remote backups across writers. Investigate deletion/rewrite and compare independently held evidence. Recovery requires deliberate repository-owner reconciliation; never silently reseed a deleted ledger from one possibly stale machine or call a single backup complete repository history.

Pending configuration is uncertainty. Compare the actual local declaration with current accepted metadata. A confirmed remote edit plus failed local write is drift; explicit setup repairs from accepted authority. A stale configuration request must be recreated against the current metadata revision, not retried as a silent override.

For interrupted setup, retry explicit setup to reuse the UUID/pin intent or explicitly uninstall. A strict private setup intent is durable before first tracked publication; it is not runtime approval. For interrupted provider edits, preserve `agent-hooks.pending.json` and its exact snapshots. Owning APIs recover only before/after states; edited third states and unknown/live leases require local reconciliation. Never remove a lease merely because it is old.

For incomplete accepted contribution imports, retain immutable accepted files and retry the same trusted input. Earlier confirmed envelopes remain accepted; retries deduplicate by validated records. Completion requires verified EOF and every batch confirmed. Do not delete/archive history to bypass a run budget or fabricate a source checkpoint for a public contribution.

A missing/deleted worktree can retain exact journaled per-observation proof. Automatic inventory does not authorize unseen history at a reused path. Resolve remaining ambiguity through an explicit private mapping/override/historical assertion and current causal controls; do not invent cwd provenance.

[Uninstall](UNINSTALL.md) · [Troubleshooting](TROUBLESHOOTING.md) · [Git transport contract](superpowers/research/2026-10-22-git-data-transport.md).
