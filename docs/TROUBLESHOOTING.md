# Troubleshooting

| State/check | Meaning and action |
| --- | --- |
| `needs-setup` / suspended / missing runtime | Explicitly review and run setup in this clone. Changed pins are never installed by a hook. |
| `pending` / queued | Local work exists without confirmed remote acceptance. Repair normal Git routing/authentication and retry sync. |
| `partial` | Skipped reconciliation, unavailable/unsupported source or incomplete/unknown units. Run manual collection where the agent runs; do not infer complete history. |
| `conflicted` / wrong target | Causal evidence, destination or UUID disagrees. Preserve history and follow recovery; do not force-push or relabel another repository. |
| `unsupported` | Future schema or unsupported source contract. Preserve data and use a deliberately compatible runtime. |
| configuration `uncertain` | Pending edit outcome is unknown. Compare actual declaration with accepted authority. |
| configuration `drift` | Actual local declaration differs from accepted metadata. Explicit setup can repair it; never roll back remote authority from stale files. |
| edited hook/provider entry | Owning APIs refuse deletion. Preserve user code, ownership and pending snapshots, reconcile locally and retry. |
| active/unknown lease | Stop concurrent owned operations and retry; age alone never proves owner death. |

Use `status --json` for local accounting and `doctor --json` for required setup checks and safe source capability codes. `doctor --remote --json` opts into bounded read-only validation. Read access does not prove write access, signing, branch-rule acceptance or hosted private-image support.

Native provider trust/review is explicit and may require restart. On the inspected Codex snapshot, linked worktree hooks load from the primary checkout. Review that checkout instead of assuming a local config alone activates hooks. Codex/Claude native timeout `10` is seconds; Gemini `10000` is milliseconds; Badge keeps its own two-second budget. Windows uses manual synchronization.

Native Claude amounts are unknown/omitted. OpenCode presence does not certify additive fork/import usage. Cursor context occupancy is not spend. Missing explicit roots are unavailable, not zero. Gemini saved successful requests remain partial and recognized models can be unpriced. [Exact support boundaries](ATTRIBUTION.md).

A stale README image can be an HTTP cache even when the ledger commit is confirmed. GitHub setup embeds a fixed public SVG route; authenticated private image rendering remains unverified. Do not reset usage to refresh an image.

[Recovery](RECOVERY.md) · [CLI](CLI.md).
