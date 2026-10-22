# Operational CLI and private controls — Task16

Implemented for the unreleased repository-native candidate on2026-10-22. No hosted
or actual Linux/Windows/private-image gates are claimed. The public wire schema is
unchanged. Exact runtime/release artifacts remain Task18 work.

Core `getStatus(ctx, options?)` is usable without a CLI integration owner. It reads
`readStoreSnapshot(ctx)` and a validated immutable local accepted commit through
`loadLocalAccepted` / `readLedgerCommit`; it performs no network, installation,
lease, directory creation or chmod. Absent integration evidence is not-inspected,
never healthy. Individual atomic files/journal records are validated; a concurrent
write can make the reporting view conservatively stale. No historical cap is added.
Task17 owns indexed acceleration for these full validating views.

`IntegrationPort.inspect(ctx, signal)` returns static required checks plus private
identity/policy/binding/roots for orchestration. The CLI adapter composes installing
activation/Git/provider owners. Core never imports the CLI or duplicates ownership
rules. `diagnose(ctx,{integrations?,remote?,timeoutMs?})` defaults to local checks,
requires complete owning setup/runtime/Git/provider inspection to claim health, and
bounds all inspection stages, including capability discovery and explicit remote reads. Freshly fetched authority controls remote policy diagnosis; pending requests remain uncertain and absent declarations stay absent. Doctor exposes `configuration`, reports exit4 for proven drift, and returns `remote:history-conflict`/required `remote-history:fail`/exit2 when a ref disappears after durable presence, accepted history or validated binding evidence. An empty never-initialized destination stays distinct. It does not write/reseed remote history or advance the local accepted anchor. Remote read is not proof of write, branch-rule,
signing, native trust or private image capability. `uninstall({repository,
integrations?,signal?})` requires the owner to report `deactivated` independently
from unresolved cleanup. It preserves journals, controls, accepted evidence,
unknown files, runtime cache and active/unknown leases. Edited pending snapshots
remain with actionable static refusal codes; strict interrupted setup intent is
removed through its owner.

`LocalStore.controls()` and `commitControl(record)` add source-free explicit intent
under `<privateDir>/controls/<recordHash>.json`. Each file contains exactly one
public ControlRecord(schemaVersion2/normalizationVersion1), canonical bytes,
matching64-hex filename, strict owned regular file mode0600 and <=256KiB. No source,
checkpoint, cwd or provider identity is fabricated. Publication is idempotent under
the existing usage-store lease; unknown/different/corrupt existing bytes refuse.
Partial unpublished `.tmp-<uuid>` files remain inert. There is no directory-count
or historical cap. Snapshot, pending, acknowledgement, collector known controls,
contribution export, sync and uninstall all include/preserve this namespace.
Acknowledgement still accepts only known local hashes; imported public envelopes
are retried from their own files and never become fake private source journals.

Explicit controls validate a successful current accepted snapshot using sync with
collect:none and no initialize. Offline/unbound requests refuse before intent is
applied. A local opaque observation ID can establish cached membership through
attribute-only private choices; remote-only unit keys need no local observation.
All relevant cached copies reproject without native discovery. The control fixes
current accepted/local causal heads once, journals canonical source-free intent,
and enters normal sync. Subsequent transport retries never regenerate heads to
supersede a concurrent later exclusion. Contribution export includes all evidence
for selected units plus transitive control/correction closure, preserving disputes.

`RepositoryOperationRequest.synchronize:false` is explicit supervised local capture
only. It uses the existing worker group/usage lease and returns local unchanged or
queued progress without calling sync transport. Default and automatic call sites
retain their existing synchronization path. CLI distinguishes local pending data
from a remote confirmed commit; `--full` is manual historical reconciliation.

CLI JSON has schemaVersion1 and command discriminator, static failures/exit codes,
public counts and redacted explanations. Accepted ledger objects/private normalized
source data never appear in JSON. Public managed contribution paths are the explicit
normal-staging exception. Exit codes and every command are documented in[CLI](../../CLI.md).

The CLI plaintext formatter consumes only typed handler summaries, with the same safe fields as JSON: redacted attribution, checks, static repair/action codes, independent deactivation and unresolved cleanup, managed contribution paths, provider outcomes/capability limits, accepted commit and configuration state. It never dumps raw exceptions or private ledger/source objects. Unsupported runtime diagnostics retain their static typed message before operational imports.
