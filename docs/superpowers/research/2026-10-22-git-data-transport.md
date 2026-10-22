# Git data transport decisions and local evidence

Implemented on 2026-10-22 against Git 2.49.0 with isolated synthetic local bare
repositories. No live destinations, credentials or provider histories were used.

## Destination and object trust

Canonical routing keys identify consent; they are not executable URLs. Private
bindings retain both expanded raw URLs and canonical keys. Synchronization fetches,
validates UUID/metadata, pushes and confirms against the actual bound push URL,
even when the named remote's fetch URL differs. Relative local paths become
absolute file URLs so another remote of the same name cannot redirect them.

Git can expand an already expanded URL again. `ls-remote --get-url` is a local,
no-network check for literal fetch expansion. Applicable changing `pushInsteadOf`
mappings are rejected conservatively: a named explicit pushurl suppresses these,
but a literal push does not. Config read/parse/output failures suspend operations.
Local redirect fixtures cover both distinctions. Arbitrary concurrent mutation of
trusted Git/SSH configuration between checks remains outside atomic routing
assurances; executable literal URLs prevent mutable remote-name lookup at send.

All object reads and ancestry checks disable replacement objects. Existing user
replacement refs are preserved. Full trees reject duplicate paths including
disjoint duplicate directories, unsupported modes/types/paths, oversized individual
blobs, incompatible metadata/catalog and incorrect derived artifacts. There is no
incoming-envelope cap on complete historical trees. Full validation currently
loads historical trees and launches per-blob Git reads; indexes and large-ledger
performance belong to Task17, and the hard CPU supervisor belongs to Task10.

## Advertised old-OID guard

The authorized replacement for an empty internal hooks directory contains only an
owned executable POSIX shell pre-push guard. `--verify` is explicit. The guard
requires exactly one update, the fixed data ref, the validated candidate OID, and
the fetched expected old OID. Only explicit first creation expects all zeroes.
No code/user hooks execute, and ordinary push remains FF-only with no force/lease.

This closes a real race: a plain FF-only push accepts creation if a previously
seen ref is deleted between a local check and remote advertisement. A RED test
observed that unwanted recreation. The guard now rejects it before objects are
sent. A separate real-Git test deletes the remote ref inside the owned guard after
advertisement; receive-pack's atomic old-OID comparison rejects the update.

The guard adds one small shell process per attempted push. It uses only shell
builtins; it never starts the CLI/runtime or depends on tracked branch files.
The local proof is macOS/POSIX; it does not certify Windows automatic execution or
a two-second end-to-end budget. Unavailable shell/signing/transport queues data.
Configured signatures can expose normal public signer key/certificate identity;
fixed bot author/committer fields do not guarantee signer anonymity. Signing
policy remains unchanged.

Primary behavior references:

- [Git pre-push hook input and rejection](https://git-scm.com/docs/githooks#_pre_push)
- [Git push verification](https://git-scm.com/docs/git-push)
- [Git 2.49.0 receive-pack old-OID transaction](https://github.com/git/git/blob/v2.49.0/builtin/receive-pack.c)

## Private durability and later operation APIs

`LocalStore.transportState()` and `recordAcceptedLedger(state)` use strict private
`transport.json`: schemaVersion 1, repositoryId, canonicalPushUrl, fixed dataRef,
and nullable commit. Null records presence/indeterminate first-creation intent
before sending, never erases an accepted commit, and cannot change destination or
UUID. Accepted commits are anchored at `refs/agent-badge/accepted/<oid>` before
state persistence and acknowledgments. New fetched tips must descend from that
anchor and retain all previously accepted immutable observation/control paths;
deletion, valid-looking rewind or descendant record deletion cannot discard acknowledged
records. Invocation refs use `refs/agent-badge/transactions/<uuid>` and are cleaned
on normal completion. A killed process may leave an invocation ref/temp directory;
these are private artifacts, not authority for accepted state.

`syncUsage` accepts absolute `deadline`, AbortSignal, retries 0..3, collect mode
`none|incremental`, optional collector inputs and explicit first initialization
metadata/catalog. Existing remote metadata always wins over bootstrap input.
Returned accepted state includes validated records, reduced ledger, artifacts,
metadata/catalog and commit for later explicit configure/control operations.
Ordinary sync unions immutable controls without rebasing persisted user intent;
a later explicit inclusion can use accepted remote control heads.

Acknowledgments require actual hash inclusion in a fetched validated snapshot.
Lost successful responses and death before acknowledgment replay without creating
a duplicate commit. Signal/deadline cover binding, Git and collection; synchronous
CPU work still requires the parent supervisor. No public CLI cutover is included.
