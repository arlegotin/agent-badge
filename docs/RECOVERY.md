# Recovery

Start with local `status --json` and `doctor --json`. Inspect static states, accepted commit, queue and actual declaration drift. `doctor --remote` explicitly opts into bounded remote reads; it proves neither write permission nor hosted image rendering. Do not delete private state as a first repair.

Offline or failed sync retains local usage. Retry `sync` after normal Git authentication/routing is repaired; use `collect --full` for explicit historical reconciliation. Automatic wakeups have a two-second total budget and can leave cold/large/incomplete work pending. Unknown coverage is not proof that a scan completed.

Automatic publication to local paths or file URLs is unsupported because stopping a local Git receiver can leave its remote reference lock behind. Capture continues; use explicit manual `sync` for those routes. If a manual local sync is interrupted during publication, have the remote owner inspect the transaction before recovering a lock. Badge does not delete remote locks. Normal hosted Git receivers run independently of the local hook worker.

A missing/replaced `agent-badge/data` after accepted-history evidence is a conflict, not permission to initialize again. Preserve private accepted anchors, journals and remote backups across writers. Investigate deletion/rewrite and compare independently held evidence. Recovery requires deliberate repository-owner reconciliation; never silently reseed a deleted ledger from one possibly stale machine or call a single backup complete repository history.

After a repository rename or transfer, run explicit setup with the updated repository URL and selected remote. Setup preserves the UUID and local pending usage, validates that the destination retains the previously accepted history, and then updates the private binding and managed README route. A missing, foreign or divergent ledger is refused. If setup stops after updating the binding but before activating it, retry explicit setup; automatic operations remain suspended until approval is complete.

Disposable query caches can rebuild across bounded automatic invocations while the immutable journal and Git ledger remain intact. Incomplete rebuilds remain queued. Retain the authoritative journal, controls, acknowledgement receipts and Git objects; deleting those is not cache repair. An unconfirmed prepared transaction is also disposable and never proves that its records were accepted.

Pending configuration is uncertainty. Compare the actual local declaration with current accepted metadata. A confirmed remote edit plus failed local write is drift; explicit setup repairs from accepted authority. A stale configuration request must be recreated against the current metadata revision, not retried as a silent override.

For interrupted setup, retry explicit setup to reuse the UUID/pin intent or explicitly uninstall. A strict private setup intent is durable before first tracked publication; it is not runtime approval. For interrupted provider edits, preserve `agent-hooks.pending.json` and its exact snapshots. Owning APIs recover only before/after states; edited third states and unknown/live leases require local reconciliation. Never remove a lease merely because it is old.

For incomplete accepted contribution imports, retain immutable accepted files and retry the same trusted input. Earlier confirmed envelopes remain accepted; retries deduplicate by validated records. Completion requires verified EOF and every batch confirmed. Do not delete/archive history to bypass a run budget or fabricate a source checkpoint for a public contribution.

A missing/deleted worktree can retain exact journaled per-observation proof. Automatic inventory does not authorize unseen history at a reused path. Resolve remaining ambiguity through an explicit private mapping/override/historical assertion and current causal controls; do not invent cwd provenance.

[Uninstall](UNINSTALL.md) · [Troubleshooting](TROUBLESHOOTING.md) · [Git transport contract](superpowers/research/2026-10-22-git-data-transport.md).
