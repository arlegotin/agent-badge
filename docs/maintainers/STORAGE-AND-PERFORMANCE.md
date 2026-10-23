# Storage and performance boundaries

Current platform scope is amended by the [stable release platform decision](../superpowers/specs/2026-10-23-release-platform-scope.md): Linux/macOS execution; safe rejection on native Windows. Prior reports and hashes below retain their historical scope and do not certify native Windows support.

Repository-private immutable journal entries, source-free controls, and confirmed
acknowledgement receipts are durable authority. SQLite files under the private
`cache` directory are disposable query indexes. They never authorize collection,
historical attribution, remote acceptance, or acknowledgement independently.

Owning operations verify authoritative file membership and device, inode, size,
nanosecond modification/change times, mode, and owner fingerprints under the
store lease. Changed or missing cache generations rebuild from authority; schema,
references and content hashes are checked during rebuild and indexed record reads.
A still-verified prior inventory detects a removed journal tail or control. A
corrupt index cannot establish a missing-file claim. Simultaneous loss of an
authoritative tail and its disposable inventory cannot be inferred from derived
checkpoints. Read-only status and doctor do not open or repair writer indexes.

Authority is fsynced before the index transaction. SQLite uses private owned
files, rollback journals and full synchronization; publishing its generation
manifest follows database close. No process-wide umask change is required.
Acknowledgements are immutable canonical batches of at most 3,000 hashes and
256 KiB each, with no aggregate historical ceiling. Confirmation follows actual
accepted inclusion; candidate commits and cached cursors cannot acknowledge work.

An accepted snapshot cache binds an exact verified Git commit, metadata, catalog,
summary and hash membership. New contributions reuse the existing reducer over
the complete affected unit/coverage/control component. Full versus incremental
equivalence includes conflicts, canonical input hash, exact price rounding, SVG
and report bytes. Metadata changes require a new validated snapshot. Explicit
readers can materialize the complete ledger. A warm empty queue still checks the
current bound remote tip; changed/deleted remote authority takes the normal
validation or recovery path.

Accepted generations alternate between two fixed private database slots. The
manifest binds the selected slot, fingerprint, validated state and prior commit.
The active database is read-only. Extensions copy it into the inactive slot, then
commit, close and fsync that replacement before atomically publishing the manifest.
Full rebuild promotion copies its sealed stage and retains the stage until
publication. An interruption leaves the active base usable; no hardlinks or
in-place active-database writes are used. A prior transport anchor or live candidate
base pins its slot until the normal acceptance transition releases it.

An advanced current remote can complete strict staged validation while an older
anchor pins the needed slot. Only after that current stage is durably sealed does
the owning sync reuse its normal UUID, ancestry, retention, Git-anchor and transport
state acceptance routine, then publish the cache. Partial stages, old intermediate
stages and unconfirmed candidates cannot use this handoff or acknowledge records.
Death between acceptance and cache publication leaves the complete stage retryable.
Generation work requires 500 ms usable budget; the worker's deadline includes the
supervisor's cleanup reserve inside the unchanged two-second outer limit.

Git blob reads use bounded `cat-file --batch` requests with header, type, length,
and actual object-ID verification. Cold writes use bounded filename batches;
unchanged validated parent objects are reused. Filename-based hashing explicitly
sets `--no-filters`: the [Git hash-object manual](https://git-scm.com/docs/git-hash-object)
specifies that this bypasses attribute filters and line-ending conversion. The
clean-filter regression checks both canonical artifact bytes and that user filter
commands never execute. The private temporary Git index does not consult the
user's index or worktree.

Resumable tree inventory omits `ls-tree -l`: requesting sizes there opens every
historical blob again on each resumed pass. On a synthetic 13,062-entry tree this
cost 309–319 ms, versus 26 ms for the same mode/type/OID/path inventory. Only the
selected unverified blob batch now uses bounded `cat-file --batch-check` to prove
exact OID, type and size before content allocation. Unknown sizes cannot pass
promotion; reused records must match both verified OID and canonical kind-specific
path. Names-only retention traversal measured 22–25 ms and remains unchanged.

Mutable provider sources retain full SHA256 prefix verification and before/after
identity/generation checks. Private immutable-state fingerprints do not replace
that proof. A 1 MiB streaming scratch buffer verified a synthetic 128 MiB prefix
in 53.25–54.15 ms on Node 24.0.0, macOS arm64 (five samples); a separate actual
collector regression demonstrates progress and later append beyond 3 MiB.
These are component measurements, not integrated hook latency claims.

Automatic discovery inventories bounded native candidates, then resolves physical
identity before checkpoint reuse or source reads. Unresolved discovery markers
never become durable source generations. Fair untargeted scheduling reserves the
next starting candidate before work, then records the completed boundary once.
Repeated interruption therefore eventually makes every candidate first.

Automatic outbox transactions select complete unit groups, targeting 128 records
and 512 KiB. Current controls and corrections retain their complete references;
imported envelopes and explicit metadata operations remain atomic. Only hashes
present in a confirmed remote snapshot are acknowledged. An oversized group is
reported and deferred while independent groups progress. Pending counts remain
exact. A covering unit query reduced a measured 128-record selection from
613–623 ms to 3.9–7.7 ms without changing the selected records.

Both disposable indexes support bounded rebuild stages. Local stages bind the
full authoritative inventory; accepted stages bind an immutable Git commit and
an owned private ref. Partial stages cannot answer membership, policy or summary
queries. Accepted promotion requires complete strict tree validation, canonical
artifacts, retention and ancestry, even when unchanged records come from a
verified base. Completed recovery may return queued before another transaction.
Collection publishes its derived index before entering network work, under the
same usage lease, so a network deadline does not discard completed local work.

Automatic candidates reuse the accepted stage files and owned ref. Before push,
the stage records a bounded canonical delta and its exact base/candidate/binding.
It remains unconfirmed. Recovery requires a fetched tip containing the candidate,
the verified base anchor, the exact parent and complete changed path/mode/OID map,
and regeneration with the shared reducer. An advanced tip additionally retains
every candidate immutable path and passes complete validation of all intervening
changes. A prepared but unpublished candidate cannot override a later selection
or control intent. Corrupt or unavailable derived evidence falls back to strict
rebuild; it never supplies acknowledgements.

The scale, bounded-progress and recovery gates completed. The latency-goal
exception is recorded below; Task17 independent review is complete. Full-scale
attempts are retained separately:

| Attempt | Recorded progress | Outcome |
| --- | --- | --- |
| First cold generation | Last periodic milestone: 3,350 confirmations at175 calls/238s | Repeated accepted-cache rebuilds; stopped with fixture retained |
| Second cold generation | 11,520 confirmations at300 calls/472s | Recurrent rebuilds collapsed throughput; stopped |
| Generation fix, owning observer | 9,984 confirmations at235 calls | Observer could repair the local cache; diagnostic samples only |
| Read-only observer, local receiver | 21,888 confirmations at635 calls; complete first collection pass | Prepared remote ref lock stranded by client termination; failed publication-progress gate |
| Read-only observer, independent loopback receiver |100,000 confirmations/pending0 after1,814 automatic calls/2,375.31s including observations | Cold completed; append and both cache-loss recoveries completed |

The earlier100-source/1,000-unit pilot's three-sample unchanged p95 values of
259ms targeted and319ms untargeted missed the250ms target. A traced10,000-unit
offline backlog completed in81 calls/132s; that is separate preliminary evidence.
The completed Node24 cold gate used10,000 actual native source files. Append
confirmed100,001/pending0 in two calls (1,957.12ms deferred,903.43ms confirmed).
Deleting the local derived index required19 calls/29,098.24ms summed hook time;
deleting the accepted cache required294 calls/213,244.91ms. Their maximum calls
were1,731.63ms and1,739.44ms. Final strict read-only verification confirmed100,002
units/pending0 after the recovery append. These are bounded automatic progress
measurements, with the observer's full validation time accounted separately.

The first warm loop blocked its own verbose receiver-log reader while invoking
hooks synchronously:30 targeted calls and the first8 untargeted calls succeeded,
then22 untargeted calls reached their deadline. A direct
read-only receiver probe reproduced timeout on call39; yielding the parent event
loop restored the unchanged receiver immediately. Warm harnesses now service that
reader between individually timed hooks. The corrected frozen-build installed
shell-wrapper set had60 fresh calls, all unqueued, p95380.25ms. Targeted n30
p95409.40ms also missed250ms. No production deadline or accounting rule changed.
Final-build Node 24/26 installed pre-push p95 was 382.28/443.23 ms; targeted direct
approved-bootstrap p95 was 330.86/373.40 ms (30 fresh samples each, actual worker
runtime proved through owning setup). These targeted timings exclude the native
provider locator; installed locator behavior and its absolute deadline have
separate regression coverage. Each set follows one separate runtime-proof probe,
with no timed samples discarded. Controller Ruling 68 accepts those measured prerelease results while
retaining 250 ms explicitly as an unmet optimization goal. Avoiding another
discovery/startup trust mechanism serves the minimum-maintenance/minimum-risk
priority. This is not a universal 500 ms claim; the hard 2 s limit and inventory,
current-authority and accounting checks remain unchanged.

On Apple M3 Max, 14 available CPUs, 38,654,705,664 bytes RAM, Darwin 25.6 arm64 and
Apple Git 2.39.5, separate `time -l` command maximum RSS was 120,520,704/124,387,328 bytes
for Node 24 targeted/pre-push and 128,892,928/132,939,776 bytes for Node 26. These are
reported command maxima, not the simultaneous sum of every hook/worker/Git
process. The observer's full-authority validation RSS is separate. The local query
DB was 518,397,952 bytes and each accepted-generation slot 200,912,896 bytes.
Explicit full read-only snapshots and ledger materialization still scale with
history. The 100k gate's observer reported 1,596,063,744 bytes RSS after strict
verification, which took 30,035 ms; that is neither worker memory nor a measured
peak. The command RSS probes cover populated warm hooks; a simultaneous cold
process-tree memory peak was not measured.
The distinct fresh offline gate precollected 10,000 unconfirmed units across 1,000
native source files, then drained them in 79 automatic calls: 89.33 s summed hook
time, 90.60 s including read-only observations, maximum call 1,279.91 ms, exact
pending zero. Its append confirmed unit 10,001 in 1,000.51 ms. Strict read-only
verification passed. In the larger cold gate, the maximum of all 1,814 hook calls
was 1,946.39 ms. At that intermediate measurement, standard/package checks remained in progress. Their subsequent completion and the final candidate scope are recorded in [candidate verification](RELEASE-VERIFICATION.md).

The second fresh run reached 11,520 confirmations after 300 calls/472 seconds;
recurrent rebuilds again collapsed throughput. A retained-fixture trace caught
confirmed installation starting at 1,871 ms with a misleading 110 ms remaining,
then dying during its SQLite transaction. The next invocation correctly rejected
the changed DB/old manifest. That evidence motivated the shared generation
transition and corrected usable deadline, replacing earlier per-path flush fixes.
Synthetic private copy plus file/directory fsync on Node 24, ten samples each,
took 19.0–22.7 ms for 24 MiB and 76.1–152.4 ms for 192 MiB. These are component costs.
After the generation and bounded-size changes, a 60-call production probe completed
the retained fixture's staged recovery and advanced 12,800 to 13,568 confirmations
without another full rebuild. The later fresh full-scale completion and cache-loss
results above validate that progress; the250ms unchanged-hook target remains unmet.

Benchmark observation must itself be read-only. An owning pending-count query can
repair a derived index between hooks and contaminate automatic-recovery evidence.
The initial harness had that flaw; a later run was stopped after 235 calls when it
was found, and those samples remain diagnostic only. The final harness reads
transport/summary/stage telemetry, reports unknown pending counts during progress,
and uses the read-only authority snapshot for exact completion. Strict full-tree
verification runs after the measurement phases without accepting commits or
refreshing caches. Observer time/RSS and actual hook-command time/RSS are separate.

Repository rename/transfer is an explicit setup operation. A changed approved
target or declared URL can transition durable binding only after the destination
proves the same UUID/data ref and a descendant retaining all previously accepted
immutable paths. The transition uses the usage lease and compares the exact
planned transport state before writing. Missing, foreign, divergent or never
confirmed destinations are refused. Automation cannot rebind. A crash before
activation publication leaves a truthful conflict until explicit setup resumes.

All fixtures are synthetic and temporary. `scripts/bench/` provides component
and installed-hook harnesses; test/probe execution uses the hermetic runner
recorded in the Task 17 report. Builds clean only known generated package outputs
and compiler build metadata before compiling so removed v1 modules cannot remain
in packaged `dist` files.

Automatic publication requires a receiver outside the supervised client process
group. For local paths and file URLs, Git starts receive-pack as a client child;
terminating that group during a prepared reference transaction can leave a lock
in the remote repository. Automatic operations therefore retain captured usage
but refuse local/file publication with a static manual-sync diagnostic. The guard
checks the verified expanded route, including URL rewrites. Confirmed-history
reads and receipts remain available. Explicit manual local sync remains supported,
but cancellation during its receiver transaction can require remote-owner recovery;
Badge never deletes a remote lock.

A clean read-only-observer scale run exposed this boundary after 635 calls:
21,888 confirmations, all 10,000 sources collected, then ten unchanged-inventory
calls with no confirmation progress. Phase tracing found a rejected push caused
by the receiver lock, rather than a cache replay problem. A deterministic probe
confirmed that the client, receiver and prepared reference hook died together
while the lock remained. These samples are failed local-transport evidence.
Hosted-remote benchmarks instead use a loopback-only, exact-fixture Git daemon
whose process group is owned separately by the harness. Tests prove that its
receiver survives client termination, completes the transaction, and is then
stopped by fixture teardown even when data is retained. Git documents the
[daemon's explicit export/service controls](https://git-scm.com/docs/git-daemon)
and the [prepared reference transaction's held locks](https://git-scm.com/docs/githooks#_reference_transaction).

Native `git://` routes have a distinct protocol/host/port/path canonical identity;
unknown URL schemes are rejected before SCP parsing. Git documents
[native Git and SCP-like SSH URLs separately](https://git-scm.com/docs/git-clone#_git_urls).
Earlier activated native-Git keys require the existing explicit validated setup
rebind; automation cannot silently rewrite durable consent.


The macOS default execution sandbox denies loopback bind and client connection.
The daemon-backed synthetic gate therefore uses an explicitly approved escalation
for the exact command, with an allowlisted environment, fresh isolated HOME,
empty Git configs, fixed supported Node/system Git PATH and synthetic provider
roots. No inherited tokens, SSH agents or NODE_OPTIONS are available. Its receiver
exports only the generated bare repository on127.0.0.1, has a two-hour lifetime,
and is stopped independently of keeping fixture data. This execution is outside
the default sandbox; environment isolation does not imply OS sandboxing.

Untargeted private-driver samples and complete installed pre-push wrapper samples
are distinct. The latter include the generated shell entry's runtime checks and
exec; thirty fresh wrapper processes on populated state are required for the
published unchanged-hook tail target. Native targeted samples start the exact
approved bootstrap command. Full authority validation after measurements remains
an observer operation and is excluded from hook resource claims.


The measured fixture harness was macOS-specific: it used `/private/tmp`,
`/dev/null` and macOS `time -l`. Task18 replaces receiver/warm/wrapper guards with
canonical OS temporary-root validation, gives the receiver an owned empty Git
config, and supplies portable test isolation/fixture roots. The receiver and
process-group suites remain POSIX-only; memory `time -l` evidence remains macOS
only. Configured Linux/Windows jobs have not executed here. Windows automatic
supervision remains explicitly unsupported. See [candidate verification](RELEASE-VERIFICATION.md).
