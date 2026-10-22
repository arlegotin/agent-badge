# Task 5: durable collection and recovery

Status: DONE. No provider histories, credentials, external network writes, publishing,
or pushes were used. Every source, repository, process and disk-failure fixture is
synthetic. Implementation stays beside retained v1; no v1 migration or dual-write.

## Implemented and integration APIs

The public core entry exports `openStore`, `LocalStore`, `StoreOptions`, `StoreError`,
`CheckpointScope` and `JournalEntry` from `storage/store.ts`.

- `openStore(ctx: RepositoryContext, options?: StoreOptions): Promise<LocalStore>`
  requires the private root to be exactly the physical common directory's
  `agent-badge` child. Worktrees share this root. It creates/repairs private directory
  modes and fsyncs directory creation. It never touches the index, code worktree,
  HEAD, stash, code refs, `.agent-badge/state.json`, or tracked configuration.
- `commitBatch(source, batch, records)` snapshots and validates source, checkpoint,
  private normalized observations, outcome, diagnostics and strict public records.
  Source identity/schema/generation/reader and public repository/normalization/provider
  relationships are checked both on append and replay. A numbered immutable journal
  batch contains both private normalized metadata and its already-sanitized outbox
  projection. File fsync, same-directory rename and directory fsync precede a derived
  checkpoint write. A checkpoint failure can report failure after durable journaling;
  retry/restart is safe, and the caller must not interpret failure as an empty outbox.
- `pending(): Promise<PublicRecord[]>` revalidates durable journal entries and returns
  only sanitized public records, unique and sorted by canonical public content hash,
  excluding explicitly confirmed hashes. Replayed batches do not multiply public
  accounting units. Raw source strings and normalized observations never enter this
  return value. Existing immutable evidence remains available after a source disappears.
- `acknowledge(hashes)` accepts only valid digests currently known to the journal.
  Unknown hashes do not pre-acknowledge future records. The caller must first confirm
  inclusion in the accepted remote snapshot; the store makes no network claim. Its
  atomic versioned private acknowledgement file is separate from disposable cache.
  Journals/private normalized metadata remain retained after acknowledgement, allowing
  later policy reprojection without rereading transcripts. There is no pruning API.
- `withLock(signal, task)` bounds acquisition by the caller's signal and a two-second
  monotonic ceiling. Methods auto-acquire when not already inside this store's lock.
  Within one owner, store operations serialize through a queue; parallel reentrant
  writes cannot overwrite a batch, and queued work drains before release. Task errors
  and release errors have finite path-free diagnostics. The signal bounds acquisition;
  the caller must propagate its transaction deadline through scan/transport work.
- `checkpoint(source, scope): Promise<Checkpoint | null>` consumes the source descriptor
  plus `{ repositoryId, normalizationVersion, attributionPolicyHash }`. It recovers
  from validated ordered journals, never from untrusted derived checkpoint hints.
  It requires the current generation, source schema, reader and scope to match. A
  changed generation, reader or authority requires a fresh scan. Known old generations
  and same-scope cursor regressions cannot overwrite newer observed progress.
- `journal(): Promise<JournalEntry[]>` exposes validated **private** typed batches in
  stable increasing `sequence` order, including `source`, `checkpoint`, `observations`,
  sanitized `records`, `outcome`, and finite `diagnostics`. This is the Task 8
  reprojection input; never serialize it into Git. It is the sole durable batch
  authority, not an additional database competing with another state file.
- `invalidateCache()` removes only the owned `cache/` children. A malformed cache or
  deletion/replacement of derived checkpoint hints cannot clear the durable outbox.

**Collector consumption requirement:** hold `withLock` over source scanning and
`commitBatch`, not only the final append. Generation IDs are opaque: the store can
reject returning to an already observed generation, but cannot infer the chronology
of two previously unseen generation IDs without provider evidence. Task 8 owns
passing accepted data-branch policy into sanitization and the checkpoint scope.

## Lock and filesystem safety

Private directories use 0700; newly written files use 0600, and reads repair owned
private-file modes. Existing symlink/non-directory roots and child directories are
rejected; file opens use O_NOFOLLOW, private file ownership/type/size are checked,
paths are generated internally, journal names/ordering are checked, and temporary
files remain in the destination directory. Incomplete unpublished `.tmp-UUID` files
are ignored. Corrupt or future durable journals/acknowledgements fail closed; a future
acknowledgement schema also blocks new journal commits. Checkpoints are derived,
so corrupt/future hints are ignored in favor of the durable batch's checkpoint.

An operation lock records a random ownership token, PID, hostname, private process
namespace identity, and informational process-start time. Age/start time never
justifies stealing a lock. Default namespace evidence is macOS boot-session UUID,
or Linux boot ID plus PID-namespace identity. Successful probes are cached per
process; the probe has a 250ms ceiling (macOS command itself has a 200ms timeout).
Unsupported, denied, hanging, mismatching, or unavailable namespace evidence cannot
justify stale recovery. The owner must have a matching current namespace/host and
`kill(pid, 0)` must produce ESRCH. PID reuse/live owners and EPERM are protected.

`StoreOptions.processNamespace` is a focused trusted platform-identity port. Ordinary
consumers should use the default. Tests supply an explicit synthetic namespace for
deterministic namespace/lock behavior without turning a sandbox denial into claimed
OS evidence. Nothing from this identity reaches diagnostics or public artifacts.

Recovery serializes stale observation/removal through an exclusive `recovery.lock`.
Each reaper rereads the *current* owner and proves death after obtaining this guard,
unlinks it at most once, then never touches a new operation lock. Normal exclusive
acquisition can win after unlink, while the guard still exists; a second reaper must
wait/reacquire and reread. A deterministic three-child test forces that interleaving
and verifies the replacement live owner survives.

A crash while creating owner metadata, or a crash leaving the recovery guard while
an operation lock still needs recovery, may leave bounded `store-busy` with
`uncertainty: true`. It does not trigger age-based stealing. Manual recovery must
first stop all store users, establish the relevant process namespace/owner death
externally, and only then remove interrupted lock metadata. No automatic destructive
repair or lock-deletion API was added. A sandbox that denies namespace probing can
use fresh locks normally but cannot automatically recover a dead-owner lock.

## TDD and adversarial evidence

All commands use `python3 .superpowers/sdd/2026-10-22-repo-native-refactor/run-isolated.py`.
`<node24>` and `<node26>` denote the verified Node 24.0.0 and 26.0.0 executables from
implementation-context. Focused command is `<node> node_modules/vitest/vitest.mjs run
packages/core/src/storage` unless a test-name filter is mentioned.

1. Initial RED: eight behavior tests against a throwing `openStore` stub:
   **8 failed**, `Not implemented`, exit 1. Two initial fixture mistakes (policy
   shape and UUID variant) were corrected before recording this meaningful RED.
   GREEN after journal/store/atomic/checkpoint/locking implementation: eight passed.
2. Parallel reentrant mutation RED: **1 failed/8 passed**; five commits under one
   owner left `[1]` instead of `[1,2,3,4,5]`. An owner queue fixed it; **9/9 passed**.
3. Generation/cursor RED: **1 failed/22 passed**, an obsolete-generation commit
   resolved instead of rejecting. Guarding known generations and scoped cursor
   regression produced **23/23 passed**.
4. Orphan recovery-guard RED: **1 failed/25 passed**, uncertainty was false for a
   dead owner blocked by an orphan guard. Separate live/dead/uncertain process
   classification fixed it; **26/26 passed**.
5. Durable validation RED: **2 failed/27 passed**; replay accepted inconsistent
   source/checkpoint data and a writer ignored future acknowledgement schema.
   Shared replay/append validation and acknowledgement compatibility gating produced
   **29/29 passed**.
6. Release-diagnostic RED: **1 failed/30 passed**; an injected release EACCES exposed
   `private/path/secret.ts`. Release failures now pass through the finite diagnostic
   mapper. Queued-owner RED used a real child with journal rename delayed 200ms:
   **1 failed/30 skipped**, observed zero finalized batches after owner release.
   Draining the owner queue before release fixed both; **31/31 passed**.
7. Namespace regression check: deliberately disabled the namespace guard and ran
   `--testNamePattern 'unknown or different namespace'`: **2 failed/32 skipped**,
   since unknown/different namespaces incorrectly acquired a stale PID's lock.
   Restored guard; full storage scope passed. This is a mutation/regression check
   of the controller-directed identity-port addition, not a claim that OS probing
   succeeded inside the sandbox.

8. Final snapshot-size RED: helper + `<node24> node_modules/vitest/vitest.mjs run
   packages/core/src/storage/atomic-file.test.ts`: **1 failed**, oversized private
   snapshot replacement resolved instead of rejecting. Writer/read limits could
   diverge after a large acknowledgement. Cap-before-replace fixed it, preserving
   the last readable file and pending data; final whole storage scope is green.

Real child SIGKILL tests cover:

- After journal temporary-file write (not published): no cursor/no pending object.
- After journal temporary-file fsync (not renamed): no cursor/no pending object.
- After journal rename: complete validated batch/cursor recoverable.
- After journal directory fsync: durable batch/cursor recoverable.
- Before derived checkpoint rename: journal recovers the batch/cursor.
- After checkpoint rename: batch/cursor recoverable.
- Before acknowledgement rename: submitted object stays pending until caller confirms.

Each crash is followed by actual reopen/replay, stale recovery under explicit
synthetic namespace, another commit, and content-hash deduplication. Additional real
children cover four competing writers, the two-reaper/live-replacement interleaving,
and ENOSPC/EACCES at the real filesystem boundary. A checkpoint rename ENOSPC
retains the journal/outbox and its recoverable cursor. Permission/disk failures are
injected into actual filesystem calls; no real filesystem was filled.

A real synthetic linked-worktree fixture asserts shared durable data and unchanged
staged bytes, unstaged/untracked files, HEAD, refs, stash and tracked file list.
Sanitized pending output excludes source paths/raw native IDs. Source disappearance
preserves the last valid observation/checkpoint, and private metadata remains after
acknowledgement. Final test-only strengthening explicitly covers unknown hashes
before future collection and checkpoint repository/normalization/policy/reader scope.

## Final verification

- One full retained-suite run, installed Node 22: helper + `npm test -- --run`:
  **62 files / 520 tests passed, 1 gated OS integration skipped**, exit 0, 10.00s.
  Retained v1 CLI tests emit their existing mocked lifecycle output. No live
  publishing happened. This full run preceded the last two test-only additions;
  the final snapshot writer/read size-alignment correction described above followed
  this run. Per controller instruction, the retained suite ran once; focused target
  suites and typecheck/build were rerun after that correction.
- Final focused Node 24: helper + `<node24> node_modules/vitest/vitest.mjs run
  packages/core/src/storage`: **3 files / 38 passed, 1 gated integration skipped**,
  exit 0, 6.21s, including the final snapshot-size correction.
- Final focused Node 26: same scope: **3 files / 38 passed, 1 gated integration
  skipped**, exit 0, 6.00s, including all final changes.
- The sandbox denies macOS `sysctl` boot-session access and `ps`; this is treated
  as unavailable identity, never proof of process death. Two narrow synthetic
  integration commands were automatically approved with `require_escalated`:
  `RUN_STORAGE_NAMESPACE_INTEGRATION=1` + helper + `<node24|node26>` +
  `node_modules/vitest/vitest.mjs run packages/core/src/storage/lock.test.ts`.
  Both passed **2/2**, exit 0 (0.358s Node24, 0.608s Node26), reading the actual
  OS namespace, killing only their own temporary child, then reclaiming its lock.
- Helper + `npm run typecheck`: exit 0.
- Helper + `npm run build`: exit 0.
- Helper + `npm run docs:check`: exit 0, Documentation verification passed.
- `git diff --check`: exit 0 before report/commit preparation.

No manifest/release files changed, so package release checks were not triggered.
The full retained suite stays on Node22 because retained v1's native addon uses that
ABI. New storage code and its real-namespace integration ran on both target majors.

## Self-review and limits

Reviewed each new owner and the complete scoped diff. Fixed owner reentrancy,
queued-work draining, generation rollback, replay validation, future-schema write
mixing, diagnostic leakage and namespace assumptions during development. Module
sizes stay focused; the longer test file covers the requested fault/process matrix.

- Journal replay is the initial correctness implementation: it scans retained batches
  instead of maintaining another durable database. Scale/indexing benchmarks and
  disposable accelerators belong to later performance work. It does not silently
  compact, discard evidence, or promise bounded history.
- Each journal file is capped at 32MiB, batch record/observation arrays at 10,000,
  and public objects retain the protocol's tighter individual byte limit. Large
  provider work must arrive in bounded batches. The acknowledgement snapshot also
  shares the private reader's 32MiB cap. Larger replacements fail before mutating
  the old readable snapshot, so pending data survives rather than self-corrupting.
  This aggregate snapshot is a Task17 scaling constraint, not a global history
  policy. Task17/final benchmark review should consider durable acknowledgement
  events or sharding with a disposable index so growing historical hashes do not
  impose a permanent cap or require rewriting every acknowledgement forever.
- Real process death is tested; a host power cut was not simulated. Durability uses
  standard file+directory fsync and atomic same-directory rename semantics.
- Linux namespace code and Windows behavior were not exercised on this macOS host.
  Unsupported Windows process namespace means conservative stale recovery; no
  unsupported platform durability claim is made. Task18 must gate platform behavior,
  including filesystem directory-fsync support.
- Directory/file ownership and O_NOFOLLOW checks protect ordinary private-store
  boundaries. This does not claim resistance to a concurrently hostile process
  with the same OS user replacing directory components between syscalls.
- `local.json`, remote binding persistence and network inclusion verification stay
  with their owning tasks. No credentials/raw histories are discovered here.

## Scoped files

- `packages/core/src/storage/{store,journal,checkpoints,lock,atomic-file}.ts`
- `packages/core/src/storage/{store,lock,atomic-file}.test.ts`
- `packages/core/src/index.ts`
- `packages/testkit/src/{storage-fixtures,index}.ts`
- This report.
