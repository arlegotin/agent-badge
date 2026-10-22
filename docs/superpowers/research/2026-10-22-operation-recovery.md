# Configuration, operation budgets and recovery

The data branch's `meta.json` controls shared policy and catalog selection. Ordinary
sync ignores bootstrap policy once remote metadata exists and uses the private
approved binding, independent of the checked out code branch. Explicit configuration
uses a SHA256 revision of strict canonical metadata, not the usage commit ID. A usage
append can be retried; changed metadata requires review and a fresh explicit request.
Only an actually attempted candidate found in accepted history confirms acceptance.
Configuration re-renders normalized public records without provider discovery.

The remote transaction and checkout declaration write cannot be atomic together.
Before configuration sends, the private store records a strict pending marker with
`schemaVersion: 1` and `metadataRevision`. Remote acceptance followed by declaration
failure, timeout or process death never rolls shared metadata back. A definite
pre-send rejection restores previous repair evidence. After any attempted send,
uncertainty remains even if later metadata is invalid or another edit wins. The
marker is not proof of acceptance or a complete drift detector. Status/setup must
compare the actual checkout declaration with **current validated accepted metadata**;
a different marker revision never establishes that the declaration is correct.
Setup can repair the declaration from that accepted snapshot without a policy push.
Task11 owns declaration format, activation persistence and repair integration.

## Automatic deadlines

The lightweight operation launcher starts the budget before spawning an owned
worker. Repository discovery, provider parsing, journal replay, Git, helpers and
transaction cleanup all fall inside the same maximum two-second wall budget.
The parent kills the owned POSIX process group before the deadline, reserving time
for exit observation and lock cleanup. Git inside that worker inherits its group;
manual in-process Git retains its independent group cleanup. Completion also kills
remaining helpers. An unrelated launching shell/process group is never targeted.
Only status, bounded counts and a reconciliation flag cross back through IPC;
accepted ledger history stays in the worker. Queued counts can be unknown after a
kill. Automatic failures produce one static redacted diagnostic and exit zero for
agent-badge's part. The surrounding hook must preserve another delegate's exit.
Manual operations return nonzero queued/conflict/unsupported outcomes and can use
a longer caller deadline. Initial Windows automatic operations refuse before spawn;
manual process-tree cleanup is best effort until a validated Windows mechanism exists.

Explicit full reconciliation never runs in an automatic hook. Normal automatic
collection can discover small new sources without an existing checkpoint, including
pre-push without a provider hook. Current adapters parse at most 512KiB per source
per scan, safely above their 256KiB maximum line. Each invocation attempts at most
16 sources with a private persisted rotating cursor; an exact source hint bypasses
rotation. The next source cursor is persisted before its attempt, so a killed attempt
does not permanently starve later sources. Added sources enter subsequent rotations.

As a provisional Task10 guard, files larger than 2MiB (including costly warm prefix
verification) and incompatible established reader/policy scopes defer provider reads.
Known skipped/incomplete work sets a strict private durable reconciliation signal.
Only successful complete explicit manual/setup reconciliation clears it; targeted
work never clears broad pending evidence. Existing journal, queue and checkpoints
survive. Task17 must replace the provisional whole-source barrier with bounded
verified-prefix/index progress for large histories and active large sessions; this
is not a permanent product support boundary. Discovery remains deadline-supervised
and has adapter structural caps; Task17 owns its indexing/performance improvements.

Task12 can supply a trusted last-accepted/activation policy to capture local changes
before attempting network transport with `collect:none`. This policy is not remote
approval, and the worker never promotes it into shared metadata. Trust persistence
belongs to Task11; cold indexing, warm-path performance and artifact cleanup belong
to Task17. An offline fetch is not permission to discard captured usage.

## Locks and uncertain ownership

Owner JSON is completely written/fsynced in a private staging file before an atomic
hardlink publishes `operation.lock`. The filesystem must support same-directory
hardlinks; unsupported publication fails closed. Existing files and symlinks are not
overwritten. Failed publication removes its staging file. Process death can leave
staging files/private transaction artifacts for later proven-owned cleanup.

Generic stale-lock recovery requires matching host **and process namespace**, plus
proof that the recorded PID is dead. Unknown namespace, age, hostname alone or an
orphan recovery guard never authorize stealing a lock. A responsive supervisor has
stronger evidence: after observing its direct child's exit, it can remove only a
lease matching that child's exact PID and random nonce under the recovery guard.
A replacement/foreign lease is preserved. Parent death loses this evidence; it does
not license an unrelated process to apply the same shortcut. Namespace probing
races caller cancellation as well as its bounded fallback timeout.

## Restoring a deleted or damaged data ref from Git

Missing previously accepted history, malformed/future schemas, foreign repository
identity and rewritten/dropped immutable records require explicit recovery. Setup
and initialize cannot silently seed a replacement from one machine's local queue.
Do not delete the private store, accepted anchors, checkpoints or pending records to
make setup appear fresh. Pause automatic writers during owner-managed recovery.

For a deleted branch, identify the last complete, validated accepted commit from a
trusted contributor clone, a private `refs/agent-badge/accepted/<oid>` anchor or a
repository backup. Review its repository UUID, policy/catalog, ancestry and immutable
records against all available accepted tips. Local queues are partial contributions,
not a replacement history. On the trusted clone, inspect without checking out the
data branch or changing the user's index/worktree:

```sh
git show <recovered-tip>:meta.json
git ls-tree -r --name-only <recovered-tip>
git ls-remote --refs origin refs/heads/agent-badge/data
```

If the ref is still absent and the reviewed tip is the complete history to restore,
the repository owner can explicitly recreate it with an ordinary one-ref push:

```sh
git push origin <recovered-tip>:refs/heads/agent-badge/data
```

If a ref exists, do not force-push or reset it as a recovery shortcut. Preserve its
objects and recover missing immutable records into a validated forward descendant
of the current tip in a separate recovery checkout. Obtain repository-owner review
of that union/policy before an ordinary fast-forward push. Unsupported future schema
needs a compatible explicitly upgraded runtime; it is not corruption to rewrite.
After restore, run manual validation/sync, confirm accepted record inclusion, then
repair declarations from accepted metadata and resume automatic writers. Do not
acknowledge queued observations until confirmed inclusion. Lock repair with unknown
namespace additionally requires stopping all users and independently proving owner
death; removing locks solely by age is unsafe.
