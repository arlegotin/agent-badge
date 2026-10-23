# How it works

A local reader emits strict normalized observations. Attribution resolves repository membership and private proof. Sanitization emits scoped opaque public records. The private journal fsyncs observations/records before checkpoints advance. Supported readers reuse stable provider identity; causal supersession/corrections and conservative reduction prevent copied or incomparable history from becoming fabricated spend.

One repository-owned data ref, `refs/heads/agent-badge/data`, contains immutable observation/control objects plus authoritative metadata/catalog and deterministic summary/report/SVG. Normal synchronization uses invocation-private refs/index, fetches/validates current remote authority, unions pending receipts, creates fixed-identity commits and fast-forwards only that ref. It does not change code HEAD, index, worktree, stash or code refs. Acknowledgement requires confirmed remote evidence, including reconciliation after an interrupted response. It never force-pushes or silently reseeds missing accepted history.

Explicit shared controls persist source-free canonical intent under the private common directory, with fixed current causal heads. Retries cannot turn stale local inclusion into fresh authority. Configuration uses expected metadata revision compare-and-swap; private pending configuration means uncertainty until actual accepted state is compared.

Local activation approves the exact nested runtime manifest/lock. A lightweight bootstrap uses the installed private runtime; changed tracked pins suspend automatic execution. Already approved older branches with no tracked setup can reuse it. Fresh clones need explicit setup. Provider wakeups and pre-push only route bounded local capture/sync under one two-second supervisor budget; full history belongs in a manual run. Available local work is journaled before transport when possible; skipped work remains pending. Existing user hooks retain their ordinary behavior.

All recorded repository work counts across contributors, branches, forks and worktrees, including abandoned work. Merge/rebase/revert does not rewrite history. Fork destinations that differ from the declaration stay unbound; sanitized immutable public contributions travel through normal accepted PRs. Trusted import streams atomic batches and keeps earlier confirmed progress after later failure. Private producer inputs are a different protocol.

`summary.json` separates known totals, unknown/partial units, conflicts and current-catalog API-equivalent valuation. Unknown models/rates are not zero; native Claude numeric amounts are omitted, Gemini saved-success coverage is partial and recognized Gemini models remain unpriced. No number is an invoice.

`badge.svg` is generated on the data branch. Canonical GitHub setup inserts the fixed public raw SVG URL in the managed README badge, linked to data/coverage; HTTP/GitHub image caching can show old content after a confirmed sync. Local `status` and the accepted data commit distinguish synchronization from display refresh. Private authenticated image rendering has not passed an external gate; do not promise that a private README can fetch a raw SVG or recommend making private data public to work around it.

[Source contracts](ATTRIBUTION.md) · [Protocol design](superpowers/specs/2026-10-22-repo-native-design.md) · [Recovery](RECOVERY.md).
