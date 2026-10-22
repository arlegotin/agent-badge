# CLI reference

This documents the unreleased repository-native replacement. Published npm `1.1.20` uses the previous architecture and does not provide these commands. Candidate artifacts and external release gates remain pending.

Examples assume a verified candidate runtime on PATH, or replace `agent-badge` with `node .agent-badge/run.cjs` after activation. Help, version and invalid argument parsing do not install, collect, probe credentials or change files. There are no compatibility aliases for removed commands.

| Command | Behavior |
| --- | --- |
| `init` | Plan/install repository setup, activate locally, manually collect history and attempt initial data transaction; idempotent. |
| `setup` | Explicit local approval/repair of existing owned runtime and integrations. |
| `collect` | Local normalization, attribution and durable queue; `--full` requests manual historical reconciliation. No remote transaction. |
| `sync` | Incremental capture and bounded Git synchronization. |
| `status` | Local accounting, queue, provider outcomes, accepted sync commit and configuration state; no network. |
| `doctor` | Required setup/runtime/hook/schema checks and local capabilities; `--remote` opts into bounded remote read/route validation. |
| `explain` | Redacted private attribution/provenance for an opaque local observation ID; never publishes explanations. |
| `include` | Explicit opaque observation ID or public unit key; approve cached attribution and persist a causal include against current accepted control heads. |
| `exclude` | Explicit opaque observation ID or public unit key; persist a causal exclude for the unit and cached copies. |
| `contribute` | Write a strict sanitized public contribution plus causal/unit evidence for normal PR staging. |
| `import` | Strict public contribution batches or an explicitly selected private normalized source. |
| `upgrade` | Deliberate exact runtime approval and optional supported metadata/catalog request. |
| `configure` | Explicit shared metadata/catalog change with expected metadata revision conflict detection. |
| `uninstall` | Deactivate owned approval and remove owned integrations; retain ledger, journals, unknown files and leases. |

All commands accept `--json`. Results use `schemaVersion: 1`, a `command` discriminator and static status fields. Counts distinguish known data from unknown completeness. JSON never dumps accepted ledger bodies, source paths, native IDs or provider errors. `explain` stays redacted. `status.localUnits` exposes opaque local IDs for explanation/control; `metadataRevision` identifies current accepted metadata for configure requests. Public contribution output paths are safe managed digest paths.

```sh
agent-badge --help
agent-badge --version
agent-badge init --runtime-version <candidate-version> --dry-run
agent-badge setup --target upstream --json
agent-badge collect --full --json
agent-badge sync --json
agent-badge status --json
agent-badge doctor --json
agent-badge doctor --remote --json
agent-badge explain <local-id> --json
agent-badge exclude <local-id-or-unit-key> --json
agent-badge include <local-id-or-unit-key> --json
agent-badge contribute --hash <record-digest> --json
agent-badge import --file .agent-badge/contributions/<digest>.json --json
agent-badge import --normalized-source /synthetic/private/source.json --json
agent-badge configure --from-file /synthetic/private/configuration.json --json
agent-badge upgrade --runtime-version <candidate-version> --dry-run --json
agent-badge uninstall --json
```

`init`/`setup` accept `--repository-url`, `--target`, `--runtime-version`, `--dry-run`, `--import-workflow` and `--new-repository`. Standalone `--new-repository` requires a fresh clone with no private Badge state and an explicit destination URL. It never resets a foreign existing data ledger. [Fork semantics](FAQ.md).

Trusted CI imports accepted default-branch blobs, not a proposal checkout's executable code:

```sh
agent-badge import --accepted-ref <accepted-commit-oid> --default-branch <actual-default-branch> --repository-id <repository-uuid> --repository-url https://github.com/example/repo --json
```

Use exactly one of `--file`, `--accepted-ref` or `--normalized-source`. Public envelopes are `kind: "agent-badge/contribution", schemaVersion: 1`; private producer envelopes are `kind: "agent-badge/normalized-source", schemaVersion: 1`. Native exports are never guessed or wrapped. [Normalized producer contract](superpowers/specs/2026-10-22-provider-capabilities-and-normalized-imports.md).

Accepted history streams one self-contained envelope per atomic ledger batch. `confirmedEnvelopes`, `confirmedCommit`, `complete`, `retryRequired`, `retrySource` and static `failure` describe progress. Completion requires verified EOF and every batch confirmed. A later malformed or timed-out batch does not roll back earlier accepted commits; incomplete progress returns nonzero. Retain the accepted immutable files as durable retry input. Replay and ordinary reconciliation confirm already accepted records. Per-envelope bounds are not historical ceilings; no manual archival/deletion workaround is required.

Include/exclude require successful current accepted-ledger validation. Offline, unbound or wrong-target requests refuse with `current-ledger-required`; the requested inclusion/exclusion was not deferred or applied. A persisted control retains its original causal heads through retries. If a concurrent later control defeats the requested inclusion/exclusion, the command returns conflict with `recordConfirmed` true instead of silently rebasing intent. Concurrent later exclusions cannot be silently superseded by routine sync or unchanged saved attribution. Remote-only unit keys use source-free private control intent, never fabricated provider observations.

Exit codes: `0` completed requested operation; `1` incomplete/queued/unavailable/setup action required; `2` causal/identity/metadata conflict or wrong destination; `3` unsupported data/schema; `4` accepted configuration differs from the local declaration; `64` invalid CLI arguments. Explicit operation results and coverage are separate: partial provider coverage can accompany a confirmed sync. Doctor returns nonzero for failing required checks. A successful read does not prove write permission, branch-rule acceptance, signing capability, native trust or private image rendering; those checks remain unverified.

Status exposes primary `state` plus overlapping `states`: `recorded`, `pending`, `synced`, `partial`, `conflicted`; unavailable and unsupported data are distinct. `lastConfirmedSync` is a commit, not a cache-refresh time. Pending configuration is uncertainty; `drift` compares the actual declaration with accepted metadata. Older branches can have an absent declaration while retaining approved private activation.
