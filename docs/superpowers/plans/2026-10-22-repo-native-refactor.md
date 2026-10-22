# Repository-native agent-badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. This is a planning deliverable; implementation requires the user's decision to proceed.

**Goal:** Replace the Gist/global-runtime architecture with accurate local collection,
a repository-owned usage ledger and SVG, and automatic synchronization for repository writers.

**Architecture:** Strict provider observations flow through attribution and an outbound
privacy boundary into an immutable ledger. A single data branch serializes updates
with fast-forward Git pushes; private journal/checkpoints live under Git's common
directory. A pinned repository runtime drives trusted agent hooks and a bounded
pre-push fallback.

**Tech Stack:** ESM TypeScript, npm workspaces, Node 24 LTS baseline with Node 26 CI,
Commander, Zod, Vitest, native Git, a feature-tested read-only SQLite port, Changesets.

**Spec:** [Repository-native design](../specs/2026-10-22-repo-native-design.md).
**Evidence:** [Audit and research](../research/2026-10-22-repo-audit.md).
**Starting point:** `d209a47` / package version `1.1.20`; branch
`refactor/repo-native-agent-badge`. The legacy planning milestone called “v2.0” is
not a released npm major. The new release should use explicit `2.0.0` version intent.

## Global constraints

- No backward compatibility with Gist transport, old config/state, or global runtime setup.
- Keep the initializer entry point `npm init agent-badge@latest`.
- Count all recorded repository work, independent of code merges/rebases/deleted branches.
- Standard transport: `refs/heads/agent-badge/data`; fast-forward only; never force-push.
- Shared policy/catalog/normalization authority: data-branch `meta.json`.
- Private state: `<git-common-dir>/agent-badge/`; never tracked source files.
- No prompts, transcripts, agent-work filenames, local paths, credentials, or raw provider IDs in any outbound artifact, including Git metadata.
- Normal sync must preserve user index, worktree, HEAD, stash, and code refs.
- Automatic operations: two-second total wall-clock budget; at most three transport retries within it.
- Cold/full backfill never runs unbounded in a hook; pending data survives errors and timeout.
- Unknown usage/price/coverage is not zero, complete coverage, or a billing claim.
- Source collection runs where the coding agent runs. Each clone needs local activation/trust.
- No live publication, package release, credential probing, or real agent-history tests during implementation verification.
- Initial target Node range: `^24.0.0 || ^26.0.0`; tighten the minor floor if Task 1's SQLite gate requires it. Record one resulting value in every package/CI/template before proceeding.

## Review focus

1. A fork or changed remote must never inherit authority to publish upstream silently: Tasks 4, 9, 12, 15.
2. Copied/forked agent history and cumulative snapshots must never double-count: Tasks 2, 3, 6, 7, 13, 14.
3. A timeout after remote acceptance must never lose or duplicate queued work: Tasks 5, 9, 10.
4. Existing hooks, custom hooksPath, partial staging, worktrees, and nested repos must remain usable: Tasks 1, 4, 11, 12.
5. New provider schemas, corrupt source/state, and stale runtimes must preserve accepted history and expose uncertainty: Tasks 2, 5–8, 10, 16.

## Execution map

| Slice | Tasks | Deliverable / exit gate |
| --- | --- | --- |
| Feasibility | 1 | Proven Git mechanics, runtime choice, hosted-image test procedure |
| Domain and storage | 2–5 | Deterministic safe ledger, Git identity, crash-safe outbox |
| Existing agents | 6–8 | Correct Codex/Claude collection and attribution from fixtures |
| Repo-native vertical path | 9–12 | Local collection → data branch → badge; clean initializer and hooks |
| Modern integrations | 13–14 | Gemini/OpenCode capability-certified accounting; honest unsupported states |
| Collaboration beyond writers | 15 | Explicit fork contribution and trusted merged-envelope import |
| Product and release | 16–18 | Diagnostics, deletion, platform/privacy/performance proofs, major prerelease |

Tasks depend on their earlier interfaces. Provider Tasks 6 and 7 can proceed in
parallel after Tasks 2, 4, and 5; Tasks 13 and 14 can proceed independently after
the provider contract is proven. Keep storage/sync edits sequential to avoid protocol
drift. Do not release incomplete slices to `latest`.

## File structure and interfaces

Keep the current package boundaries, replace their internals in place, and export
new APIs from `packages/core/src/index.ts` only when stable. New core modules:

```text
domain/usage.ts, ledger.ts, policy.ts, capabilities.ts
providers/registry.ts
providers/{codex,claude,gemini,opencode}/{adapter,identity,reader}.ts
providers/{codex,claude,gemini,opencode}/compatibility.json
collection/{collect,attribution,source-resolver}.ts
storage/{store,journal,checkpoints,lock,atomic-file}.ts
git/{context,remote-binding,data-transport,process}.ts
ledger/{sanitize,canonical-json,reduce,validate-tree,controls}.ts
pricing/{catalog,price}.ts
render/{svg,report,summary,readme}.ts
integration/{setup,manifest,hooks,agent-hooks,runtime}.ts
operations/{sync,status,doctor,configure,contribute,uninstall}.ts
```

Tests live beside their implementation. Use `packages/testkit/src` for Git factories,
provider fixtures, fault injection, fake clocks, and subprocess assertions. Do not
retain two competing domain models after Task 17. Below, file paths without a package
prefix are relative to `packages/core/src`.

Core types defined in Task 2, referenced without renaming in later tasks:

```ts
type Diagnostic = { code: string; severity: 'info' | 'warning' | 'error' };
type ScanOutcome = 'complete' | 'partial' | 'unavailable' | 'unsupported';
type SourceDescriptor = {
  provider: string; instanceKey: string; root: string; schema: string;
  generation: string; readerVersion: string; sourceIdentity: string;
}; // private; never serialized outbound
type CheckpointScope = {repositoryId: string; normalizationVersion: 1; attributionPolicyHash: string};
// Checkpoint includes required nullable continuation:{provider,readerVersion,state} (private, <=64KiB).
type ScanBatch = {
  source: SourceDescriptor; // validated logical generation; commit this exact descriptor
  observations: UsageObservation[]; nextCheckpoint: Checkpoint;
  outcome: ScanOutcome; diagnostics: Diagnostic[];
};
interface ProviderAdapter {
  discover(ctx: DiscoveryContext): Promise<SourceDescriptor[]>;
  scan(source: SourceDescriptor, checkpoint: Checkpoint | null,
       signal: AbortSignal, scope: CheckpointScope): AsyncIterable<ScanBatch>;
}
```

Collector integration: hold the store lock across
`store.checkpointCandidate(source)`, `adapter.scan(source,candidate,signal,scope)`
and `store.commitBatch(batch.source,batch,records)`. Candidate lookup returns the
latest durable checkpoint by provider/instance/actual source identity regardless
of generation/scope; it is not certified reuse. Adapters validate scope,
schema/reader, physical epoch and content prefix, safely replay on mismatch,
and emit a resolved `batch.source`. Never fall back to an older candidate.
Opaque logical generations survive verified appends and reset on replay without
ordering them. The store still rejects cursor rollback within a logical
generation and reuse of an obsolete generation. Continuation is metadata only;
provider-owned strict schemas and byte bounds apply before any skip.

`UsageObservation`, `PublicObservation`, `MeterSegment`, `Checkpoint`, `LedgerMeta`,
`ControlRecord`, `ReducedLedger`, `RepositoryContext`, `RemoteBinding`, and operation
result types are strict schemas with inferred TypeScript types. The tasks below pin
their behavior; the spec pins the public fields. Arbitrary provider data does not
cross these interfaces.

## Task 1: Prove the risky platform assumptions

**Starting evidence:** A disposable Git `2.49.0` macOS experiment already passed
concurrent rejection/retry and nested pre-push checks while preserving HEAD, index,
and worktree. Preserve that behavior in maintained tests; this does not replace
the SQLite, hosted-image, or supported-platform gates below.

**Files:** Create `scripts/feasibility/git-data-ref.test.ts`,
`scripts/feasibility/sqlite-readonly.test.ts`, and
`docs/superpowers/research/repo-native-feasibility.md`; create Git fixtures in
`packages/testkit/src/git-fixtures.ts`; modify `packages/testkit/src/index.ts`.

**Interfaces:** Produce `createBareRemoteFixture(): Promise<GitFixture>` and
`snapshotUserCheckout(cwd: string): Promise<CheckoutSnapshot>` for later transport
tests. No public runtime interface changes in this task.

- [ ] Write executable tests for two independent commits based on the same data-ref tip; the second normal push must reject, rebuilding on the new parent must retain both records. Also invoke an internal data-only push from a real pre-push hook and verify no recursion or index/worktree changes.
- [ ] Run `npm test -- --run scripts/feasibility/git-data-ref.test.ts` and confirm failures identify any unsupported mechanics before building the transport.
- [ ] Test read-only SQLite while a second connection keeps committed data in WAL, absent optional tables, read permission failure, and lock timeout on the chosen Node floor. Prefer `node:sqlite` only if the tested API/flags work across the release matrix; otherwise record and approve one bounded WAL-aware driver choice in the spec before Task 6.
- [ ] Record a manual public/private GitHub SVG smoke procedure using a disposable repository, fixed branch URL, authorized readers/nonreaders, and observed caching. Run only if that external test repository is authorized; otherwise mark the live gate pending and prohibit private-image claims. Do not invent a result from local SVG tests.
- [ ] Record decisions and run both feasibility tests on the chosen runtime. Commit the fixtures and evidence; stop dependent work if the transport or privacy boundary is unproven.

## Task 2: Define the accounting and wire protocol

**Files:** Create `domain/{usage,ledger,policy,capabilities}.ts`,
`providers/registry.ts`, `ledger/{canonical-json,sanitize}.ts` and corresponding tests;
modify `packages/core/src/index.ts` and `packages/testkit/src/provider-fixtures.ts`.

**Interfaces:** Produce `parseObservation(input: unknown): UsageObservation`,
`sanitizeObservation(input: UsageObservation, policy: SharedPolicy): PublicObservation`,
`canonicalJson(input: PublicRecord): string`, `recordHash(input: PublicRecord): string`,
and `getAccountingContract(provider: string, normalizationVersion: number): AccountingContract`.
`AccountingContract.compareRevision(a, b)` returns `equal | before | after | incomparable`;
it must be pure and operate only on public revision/meter evidence.

- [ ] Add schema tests for measured zero versus missing dimensions, exact model/vendor IDs, cache/reasoning subset semantics, strict fields, nonnegative safe counters, and unsupported future versions. Add byte-stable canonical JSON and repo-scoped identity tests.
- [ ] Add privacy-canary tests containing prompt/path/email/credential fields in private fixtures; assert none appears in public JSON, hash preimage logs, error text, or filenames. Public strings must use bounded registered identifiers; reject arbitrary source-provided strings masquerading as models.
- [ ] Run `npm test -- --run packages/core/src/domain packages/core/src/ledger/sanitize.test.ts packages/core/src/ledger/canonical-json.test.ts`; verify the expected missing implementation failures, then implement the schemas and projection.
- [ ] Pin limits: individual public object 256 KiB; envelope 10 MiB and 10,000 objects; counters ≤ `Number.MAX_SAFE_INTEGER`; SVG labels ≤ 64 Unicode code points; only regular Git blobs under enumerated paths. Quarantine larger input with a typed diagnostic, never silently truncate accounting.
- [ ] Document each provider accounting contract's identity/revision/coverage requirements. For immutable finalized request records, equal keys with unequal meters are conflicts; for validated cumulative streams, compare only a certified provider revision/epoch. A timestamp/byte offset from a copied file is not a universal revision. Unknown ordering stays incomparable.
- [ ] Run the focused tests and `npm run typecheck`; commit the domain boundary.

## Task 3: Build the deterministic ledger reducer and presentation

**Files:** Create `ledger/{reduce,controls,validate-tree}.ts`,
`pricing/{catalog,price}.ts`, `render/{svg,report,summary}.ts`, their tests, and
`packages/core/resources/pricing/catalog.json`; adapt existing compact-format logic.

**Interfaces:** Consume Task 2 types/contracts. Produce
`reduceLedger(records: readonly PublicRecord[], meta: LedgerMeta): ReducedLedger`,
`priceMeters(meters: readonly MeterSegment[], catalog: PriceCatalog): PriceResult`,
`renderArtifacts(ledger: ReducedLedger, meta: LedgerMeta): Map<string, Uint8Array>`.
`PriceResult` separates known micro-USD, priced units, unpriced units, and catalog hash.

- [ ] Write property tests over shuffled and duplicated inputs: `reduce(A ∪ B) = reduce(B ∪ A)`, duplicate replay is identical, and independent units sum once. For cumulative same-stream observations 100 then 150, require 150, never 250.
- [ ] Test copied request history (100 + copied 100 + new 50 → 150), parent/child independent usage (100 + 40 → 140), mixed representations → conflict, explicit exclude → zero, causal downward correction, and incompatible concurrent corrections → visible conflict. Price unknown models as unpriced, not zero.
- [ ] Run reducer/pricing/render tests to see the intended failures, then implement one canonical reduction pipeline. Bind summary input hash, SVG, and report to the same snapshot; current-catalog valuation must be named in the report.
- [ ] Test exact mixed-model arithmetic, cache buckets, overflow, missing tariff, no scan-time-only content changes, Unicode labels, XML injection, and no SVG scripts/external references. Public coverage describes recorded units only, never all contributors.
- [ ] Run `npm test -- --run packages/core/src/ledger packages/core/src/pricing packages/core/src/render` and commit. Keep v1 estimator only until the command switch in Task 17; do not reuse its heuristic normalization.

## Task 4: Resolve Git identity and safe destination binding

**Files:** Create `git/{context,remote-binding,process}.ts`, tests;
extend `packages/testkit/src/git-fixtures.ts`. Replace `repo/git-context.ts` callers
only as their owning tasks migrate.

**Interfaces:** Produce `resolveRepository(cwd: string): Promise<RepositoryContext>`,
`bindRemote(ctx: RepositoryContext, requested: BindingRequest): Promise<RemoteBinding>`,
`verifyBinding(ctx: RepositoryContext, binding: RemoteBinding): Promise<BindingCheck>`,
and `runGit(args: readonly string[], options: GitRunOptions): Promise<GitRunResult>`.
Context includes absolute worktree root, Git dir/common dir, effective hooks path,
submodule boundary and known worktrees. `runGit` takes argv, AbortSignal, max output,
and isolated-index/environment overrides; never shell-interpolated input.

- [ ] Add real Git tests for root/subdir, `.git` file, linked/deleted worktree mappings, submodule/nested repo, separate Git dir, spaces/Unicode, detached/unborn HEAD, shallow clone, absolute/relative hooksPath.
- [ ] Add routing tests: upstream declaration + fork origin → unbound; matching origin → bound; explicit upstream selection → bound; changed/multiple push URLs → suspended; mismatched data UUID → rejected. Never query live credentials.
- [ ] Run `npm test -- --run packages/core/src/git/context.test.ts packages/core/src/git/remote-binding.test.ts`; implement canonical resolution and private binding persistence input.
- [ ] Test subprocess timeout, process-tree cleanup, bounded stderr, redaction, and leading-dash hostile arguments. Resolve URL normalization without leaking embedded credentials or conflating unrelated host paths.
- [ ] Run focused Git tests and commit the shared context layer.

## Task 5: Make collection durable and recoverable

**Files:** Create `storage/{store,journal,checkpoints,lock,atomic-file}.ts` and tests;
add fault injection helpers under `packages/testkit/src/storage-fixtures.ts`.

**Interfaces:** Consume RepositoryContext. Produce
`openStore(ctx: RepositoryContext): Promise<LocalStore>`.
`LocalStore.commitBatch(source: SourceDescriptor, batch: ScanBatch, records: readonly PublicRecord[]): Promise<void>`,
`pending(): Promise<PublicRecord[]>`, `acknowledge(hashes: readonly string[]): Promise<void>`,
`checkpointCandidate(source: SourceDescriptor): Promise<Checkpoint | null>`,
and `withLock<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T>`.
Outbox acknowledgement and derived-cache invalidation are separate operations.
The collector passes already-sanitized public records alongside private normalized
metadata; the store validates public records again before placing them in the outbox.

- [ ] Write restart tests that terminate after journal append, fsync/rename, checkpoint update, and before acknowledgement. Require no cursor ahead of durable data and at-least-once replay with exactly-once accounting.
- [ ] Write concurrent-process/worktree tests, bounded lock contention, stale lock recovery using process identity, disk-full/permission failure, malformed cache, unsupported future durable schema, and source generation replacement.
- [ ] Run `npm test -- --run packages/core/src/storage`; implement private directory permissions, atomic same-directory files, recoverable journal and generation checks. Cache deletion must not remove outbox data.
- [ ] Assert paths/private raw IDs never enter tracked output; successful recovery retains the last valid observation when a source disappears. Preserve durable journal entries until remote inclusion is confirmed.
- [ ] Run storage tests and commit. No dual-write to v1 `.agent-badge/state.json`.

## Task 6: Replace Codex collection

**Files:** Create `providers/codex/{adapter,reader,identity}.ts`, compatibility manifest
and tests; replace `providers/codex/codex-sql.ts` behind a WAL-aware inventory port;
extend `packages/testkit/src/codex-fixtures.ts` and sanitized fixtures.

**Interfaces:** Produce `codexAdapter: ProviderAdapter` and its pure
`AccountingContract`, registered through Task 2. Source resolution consumes explicit
local roots or `CODEX_HOME`, then the documented default; multiple enrolled roots dedupe.

- [ ] Write failing fixtures for open WAL 1,110 versus old 999, same-timestamp changes, absent optional lineage tables, unsupported schema, multiple homes, archived sessions, partial final line, truncation/rotation, model switches, spawned children, and forked history.
- [ ] Require full/incremental parity, preserved request identity across copies, inherited fork exclusion, and explicit uncertainty where no stable inherited boundary exists. `history.jsonl` is discovery-only and cannot manufacture zero usage.
- [ ] Run `npm test -- --run packages/core/src/providers/codex`; implement bounded streaming rollouts as accounting source, schema-probed read-only DB inventory, source fingerprinting, immutable-final request comparison, and isolated source errors. Cumulative ordering remains uncertified; source pins are not release-range guarantees.
- [ ] Add hooks/app-server/owned exec observations only through the same identities; do not launch/resume model work or attach to unknown servers. Record tested agent/format revisions and source URLs in compatibility.json.
- [ ] Run Codex fixture tests, Task 1 WAL test, and full/incremental equivalence; commit.

## Task 7: Replace Claude collection

**Files:** Create `providers/claude/{adapter,reader,identity}.ts`, compatibility manifest
and tests; replace `claude-adapter.ts`/`claude-jsonl.ts` callers; extend testkit fixtures.

**Interfaces:** Produce `claudeAdapter: ProviderAdapter` and its AccountingContract.
Resolve `CLAUDE_CONFIG_DIR`, explicit roots, project naming variants, and default root.

- [x] Add red tests for nested parent/child shared session IDs, duplicate streamed responses, copied/forked history, resume, agent teams/background agents, mixed models, mixed cwd, and cache creation TTLs.
- [x] Pin explicitly certified normalized/import assertions (not native CLI numeric claims): 100+40 → 140; fork 100+copied100+50 → 150; mixed supplied cards → 1,800 micros; older-mtime new file is discovered; JSON null/array/truncated tail does not abort valid files.
- [x] Run `npm test -- --run packages/core/src/providers/claude`; implement bounded per-file offsets and inventories with replacement/rotation checks, stable request/agent stream identities, and provenance retained locally.
- [x] Ensure Stop/SubagentStop only schedules targeted reads; a partially flushed final transcript retries later. Never treat Agent tool final-request totals as whole-agent totals or count the same telemetry and transcript receipt twice.
- [x] Run Claude fixture/equivalence tests, record narrow identity/source evidence and unsupported numeric accounting, and commit.

**Research/user scope correction:** omit all unverified native Claude amounts.
CLI2.1.307 premature EOF can persist placeholder output with end_turn; official
streaming docs also permit mutable input/cache deltas. No inspected historical
JSONL finality discriminator certifies numeric snapshots. Native message identities
therefore create constant all-null/model-null partial public coverage receipts.
Keep bounded strict normalized provisional evidence private; its presence forbids
numeric public-facing meters. No cumulative ordering/finality heuristic is allowed.
140/150/1800 assertions apply only to separately certified normalized/import fixtures.
Unknown-only badges say usage/cost unknown; measured zero stays distinct. Add exact
opus/sonnet/haiku5.5 identities without rates. See tracked
[Claude evidence](../research/2026-10-22-claude-accounting-contract.md).

Task7 consumes Task6 scan scope, nullable continuation, batch.source and latest
checkpointCandidate. Physical epochs are distinct from logical generations; validate
scope/reader/prefix before cursor reuse. Task8 holds one store lock across candidate,
scan and commit(batch.source). Existing v1 callers remain compiling until Task17.

## Task 8: Connect collection, attribution, and invalidation

**Files:** Create `collection/{collect,attribution,source-resolver}.ts` and tests;
reuse/adapt `attribution/attribution-types.ts` concepts and remove old engine callers.

**Interfaces:** Consume ProviderAdapter, RepositoryContext, LocalStore and SharedPolicy.
Produce `collectUsage(options: CollectOptions): Promise<CollectionResult>` and
`attributeObservation(observation: UsageObservation, context: AttributionContext): AttributionResult`.
CollectionResult contains durable queued hashes, source outcomes, and local-only diagnostics.
Hold one store lock across candidate lookup, scan and commit. Supply accepted
`CheckpointScope` as the required fourth scan argument, and commit
`batch.source` exactly; discovery's physical epoch may differ from the batch's
validated logical generation. Candidates are not proof of cursor/state reuse.

- [ ] Add tests for explicit exclusion of unchanged cached 100-token usage → zero; changes to repo mapping, aliases, parser, normalization, or policy trigger the right re-projection. Pricing changes must not reread transcripts.
- [ ] Test nearest Git repo membership from cwd, sibling/deleted worktrees, nested repos/submodules, strong contradictory remote evidence, ambiguous multi-repo sessions, and overrides before heuristics.
- [ ] Run `npm test -- --run packages/core/src/collection`; implement per-source failure isolation and auto-discovery. One corrupt provider must not remove accepted observations from another.
- [ ] Add targeted versus full reconciliation parity, provider installed after init, empty source versus unavailable source, and cancellation after partial durable batches. Do not expose raw local explanations in public projections.
- [ ] Run collection and provider tests and commit the local accounting path.

## Task 9: Implement the single-ref Git synchronization transaction

**Files:** Create `git/data-transport.ts`, `operations/sync.ts` and tests;
extend `ledger/validate-tree.ts`, Git fixtures and fault injection.

**Interfaces:** Produce `syncUsage(options: SyncOptions): Promise<SyncResult>`.
SyncOptions includes bound destination, store, collect mode, AbortSignal, deadline,
max retries. SyncResult is `synced | unchanged | queued | conflict | unsupported`
plus confirmed remote commit and acknowledged hashes, never optimistic success.

- [ ] Write real two/three-clone races, simultaneous ref creation, stale writer, lost push response, accepted push then local crash, no-op replay, and remote deletion tests. Require union totals with no lost records and no force push.
- [ ] Add byte-identical user index/worktree/HEAD snapshots, partial staging, merge/rebase in progress, detached HEAD, wrong UUID, unsafe tree entry, oversized blob, incompatible protocol/catalog, and remote URL change tests.
- [ ] Run `npm test -- --run packages/core/src/git/data-transport.test.ts packages/core/src/operations/sync.test.ts`; implement fetch/validate/union/reduce/render/private-index/commit/push/acknowledge.
- [ ] Use bot author/committer metadata, explicit one-ref refspecs, isolated hooks for internal data pushes, and caller deadlines. Compare actual pushed/fetched inclusion before acknowledgement; retain queue on indeterminate outcomes.
- [ ] Run all Git/storage/ledger integration tests; commit the first complete local-source-to-data-branch vertical slice.

## Task 10: Add policy changes, budgets, and recovery results

**Files:** Create `operations/configure.ts`, `operations/configure.test.ts`,
`operations/budget.ts`, `operations/budget.test.ts`; extend sync/storage tests.

**Interfaces:** Produce `configureRepository(request: ConfigureRequest): Promise<ConfigureResult>`
and `createOperationBudget(mode: 'automatic' | 'manual', timeoutMs?: number): OperationBudget`.
ConfigureRequest requires expected metadata revision; conflicting edits do not auto-retry as overrides.

- [ ] Add tests proving ordinary stale-branch sync cannot change shared policy/catalog/target; explicit configure can; simultaneous policy changes conflict; remote accepted/local declaration write failed is recoverable drift.
- [ ] Add stalled lock/reader/Git/auth-helper tests: automatic mode stops within the two-second budget with queued state and one diagnostic; another tool's exit remains untouched. Manual mode returns actionable nonzero codes.
- [ ] Run budget/configure tests; implement deadline propagation, a launcher-supervised worker for CPU-bound work, and metadata revision CAS within Task 9's transaction. Full rescan falls outside hook execution and becomes pending reconciliation.
- [ ] Test missing previously seen data branch, corrupt remote and future schema preserve queue/history; explicit setup cannot silently reseed from one machine. Document manual restore-from-Git procedure.
- [ ] Run focused operations/integration tests and commit.

## Task 11: Install a persistent runtime and side-effect-free initializer

**Files:** Rewrite `packages/create-agent-badge/src/index.ts` and tests;
modify `packages/agent-badge/src/cli/main.ts` and command handlers;
create `integration/{setup,manifest,runtime}.ts`, tests, and launcher/template resources.

**Interfaces:** Produce `planSetup(options: SetupOptions): Promise<SetupPlan>` and
`applySetup(plan: SetupPlan): Promise<SetupResult>`. The plan lists exact owned file
changes before applying them. Initializer forwards parsed args to shared CLI entry.

- [ ] Test initializer help/version/invalid arguments cause zero files, Git refs, subprocess installs, scans, or network calls. Test argument forwarding and Node version failure before mutation.
- [ ] Test clean non-JS repo, existing npm/pnpm/yarn/Bun repo, nested invocation, missing runtime, offline install, interrupted setup, new clone, repeated setup, and exact pinned version resolution. Do not modify root package manifests/lifecycle scripts by default.
- [ ] Run initializer/setup tests; implement `.agent-badge/run.cjs`, tracked nested runtime manifest/lock, installation under `<git-common-dir>/agent-badge/runtime/<lock-hash>`, ownership manifest, and explicit activation. Linked worktrees reuse the same approved pin without installation; a changed pin requires explicit setup/upgrade. Never rely on the temporary npm exec path or global PATH package.
- [ ] Render one README block pointing to the data branch; report initial queued/unavailable state honestly. Bind remote using Task 4, initialize metadata only for a new ledger, backfill outside hook budget, then synchronize.
- [ ] Run package entrypoint tests and a clean isolated packed-initializer smoke; commit.

## Task 12: Compose Git and agent hooks safely

**Files:** Create `integration/{hooks,agent-hooks}.ts`, platform-specific launcher
resources and tests; replace `init/runtime-wiring.ts` call sites.

**Interfaces:** Produce `planHooks(ctx: RepositoryContext, runtime: RuntimeLocation): HookPlan`
and `applyHookPlan(plan: HookPlan): Promise<HookInstallResult>`. Ownership manifest
records exact entries/backups; supported agent config versions have explicit adapters.

- [ ] Write actual Git push tests for existing shell/Python/Node hooks, early exit, nonzero exit, stdin consumer, symlink, set-e, custom relative/absolute hooksPath and hook managers. User failures must still fail; both delegates receive exact refs stdin.
- [ ] Test linked-worktree activation, minimal GUI PATH, paths with spaces, CRLF/Windows execution, missing Node/runtime, timeout, and repeated setup/removal. Refuse to replace shared/global hooks without a supported repository-local integration.
- [ ] Run hook tests; implement executable delegation rather than shell appending, targeted collection wakeups and bounded pre-push sync. Persist pending work before network attempts.
- [ ] Test agent hooks preserve unrelated JSON/TOML entries and trust decisions; duplicate setup is a no-op. Codex and Claude Stop/SubagentStop target the correct transcript/agent; no transcript content is logged. Unsupported schemas produce a local action item.
- [ ] Run platform hook integration suites; commit. Add activation instructions to generated `.agent-badge/README.md`.

## Task 13: Add Gemini CLI support

**Files:** Create `providers/gemini/{adapter,reader,identity}.ts`, tests and
compatibility.json; add `packages/testkit/fixtures/gemini` and factory;
extend registry and agent-hook templates.

**Interfaces:** Produce `geminiAdapter: ProviderAdapter`, AccountingContract and
capability manifest. Use the same collection/ledger/sync paths; no Gemini-specific publisher.

- [ ] Obtain sanitized fixtures reflecting documented saved project sessions and AfterModel metadata. Pin project mapping, model IDs, total/input/output/cached/thought subset semantics, inherited history and stable request identity.
- [ ] Add failing resume/retry/model-switch/worktree/rotation/duplicate-ingestion tests. If history lacks trustworthy identity, mark that format partial and define the supported boundary; do not replace it with generated random IDs.
- [ ] Run `npm test -- --run packages/core/src/providers/gemini`; implement versioned reader and optional targeted hook configuration with no global telemetry destination changes.
- [ ] Assert full/incremental parity, correct pricing coverage, shared retry dedupe and private-source canaries. Store tested formats and official URLs in the manifest.
- [ ] Run adapter and cross-provider accounting tests; commit and update capability docs.

## Task 14: Add OpenCode and honest capability detection

**Files:** Create `providers/opencode/{adapter,reader,identity}.ts`, tests,
compatibility.json and testkit fixtures; add `providers/capability-report.ts` and tests.

**Interfaces:** Produce `opencodeAdapter: ProviderAdapter` with version-negotiated
local export/API behavior. Produce `reportCapabilities(ctx: DiscoveryContext): CapabilityReport`
covering all registered integrations, including detected-but-unsupported Cursor/Copilot.

- [ ] Add failing v1/v2 fixture tests for separate command/export schemas, model/usage/cost provenance, forks/imports, project/worktree mapping and duplicate receipts. Use fake local commands/server fixtures; never expose a new unauthenticated network listener.
- [ ] Run `npm test -- --run packages/core/src/providers/opencode`; implement only read paths, bounded output, version negotiation and schema detection. Experimental/unknown API versions return unsupported rather than best-effort guessed totals.
- [ ] Test Cursor context occupancy cannot become token spend; Copilot organization/PR totals cannot become repository receipts; missing privileges/source formats remain visible locally.
- [ ] Test explicit normalized-import envelope contract with source provenance and stable identity, including duplicate imports. Provider-reported billing amounts must not override the selected catalog-equivalent pricing semantics.
- [ ] Run provider/capability/import tests; commit. Additional exact Cursor/Copilot adapters require their own source/fixture gate, not a checkbox claiming universal support.

## Task 15: Support fork contribution envelopes and trusted CI import

**Files:** Create `operations/contribute.ts`, tests,
`packages/agent-badge/src/commands/contribute.ts`,
`packages/agent-badge/src/commands/import.ts`, and generated workflow resource
`packages/core/resources/workflows/agent-badge-import.yml`.

**Interfaces:** Produce `exportContribution(options: ContributionOptions): ContributionEnvelope`
and `importContribution(envelope: unknown, options: ImportOptions): ImportResult`.
Envelope pins repository UUID, protocol/normalization version and public record hashes;
it contains no local source metadata or arbitrary executable files.

- [ ] Add tests for fork origin mismatch, explicit upstream writer binding, standalone new UUID, upstream accepted envelope, duplicates already in upstream, malformed/oversized/mismatched UUID envelope, and source file changed after validation.
- [ ] Assert `contribute` only writes the managed envelope and does not stage/commit; unmerged/closed PRs do not affect upstream; accepted merge import uses the same ledger transaction and renderer. Import handles cumulative/correction closure required by the chosen records.
- [ ] Run contribution/import tests; implement deterministic envelope generation and immutable digest paths. Normal fork setup remains collection-only until a destination choice is explicit.
- [ ] Generate a trusted default-branch push/manual reconciliation workflow that imports accepted files using pinned release code, minimal token permissions, no fork checkout execution, and one atomic sync/render step. Avoid reliance on another GITHUB_TOKEN-triggered workflow. Configure optional scheduled reconciliation explicitly.
- [ ] Exercise workflow logic locally with fixture payloads/refs and validate YAML. Reserve live GitHub permission checks for an authorized disposable repo. Commit and document the normal-staging exception for fork contributors.

## Task 16: Ship operational CLI, privacy-safe uninstall, and documentation

**Files:** Rewrite commands under `packages/agent-badge/src/commands` and CLI tests;
create `operations/{status,doctor,uninstall}.ts` and tests; update README, docs/CLI,
INSTALL, QUICKSTART, PRIVACY, ATTRIBUTION, CONFIGURATION, UNINSTALL, FAQ,
TROUBLESHOOTING, HOW-IT-WORKS, RECOVERY, and SECURITY.

**Interfaces:** Produce `getStatus(ctx: RepositoryContext): Promise<StatusReport>`,
`diagnose(ctx: RepositoryContext, options: DoctorOptions): Promise<DoctorReport>`,
`uninstall(options: UninstallOptions): Promise<UninstallResult>`.
CLI maps typed results to stable JSON and documented exit codes.

- [ ] Write CLI transcript/JSON contract tests for recorded/pending/synced/partial/conflicted states, current catalog estimate label, unavailable agents, policy drift, explicit setup needs, unsupported future data and wrong target.
- [ ] Test local status needs no network; remote doctor is explicit and deadline-bound; failing required checks return nonzero. Help/version are always side-effect-free.
- [ ] Test uninstall restores delegates and removes only owned settings, preserves unsynced journal and remote ledger by default, and `git add --dry-run .` cannot stage private state. Any retained v1 private file remains ignored even though v1 is unsupported.
- [ ] Run command/operations tests; implement concise output and docs. Clearly describe local activation, all-work semantics, fork submission, source support levels, cached images, private-image gate and estimates rather than invoices.
- [ ] Update docs verification to check links, CLI examples and capability consistency, replacing assertions for old global/Gist wording. Run `npm run docs:check` and commit.

## Task 17: Remove obsolete architecture and close reliability gaps

**Files:** Delete unused Gist modules under `packages/core/src/publish`,
`init/github-auth.ts`, old state/cache schemas/readers, runtime global probes,
legacy migration code/tests and obsolete MANUAL-GIST/AUTH docs; update indexes,
package manifests/lockfile, `scripts/verify-docs.sh`, tsconfig and Vitest configuration.
Add `scripts/bench/collection.ts` and `packages/agent-badge/src/commands/repo-native-matrix.test.ts`.

**Interfaces:** New core exports exclusively match Tasks 2–16. No compatibility
aliases for v1 publish/refresh/Gist commands. A detected v1 installation receives an
explicit unsupported/reinitialize message, not an automatic opaque-total migration.

- [ ] Add end-to-end acceptance scenarios from every row in spec §11: concurrent machines/worktrees, copied histories, offline restart, failed user code push, rebase/squash, removed worktree, corrupt remote, private local state, and explicit old-install handling.
- [ ] Add privacy canaries to JSON/SVG/report/envelope filenames/Git author/error output. Test hostile refs/labels/paths, symlink/submodule data-tree entries, 256 KiB object and 10 MiB envelope limits, and controlled conflict exhaustion.
- [ ] Run the new vertical path, then delete old modules and tests whose only behavior is obsolete. Remove Octokit/sql.js/native test addon dependencies if no retained module uses them; regenerate lockfile deliberately.
- [ ] Benchmark 100,000 units / 10,000 active streams, cold backfill and warm no-op/append paths. Publish environment/memory/time results; require unchanged hook p95 below 250 ms and hard automatic deadline enforcement. Optimize measured bottlenecks without weakening accounting.
- [ ] Run `npm run typecheck`, `npm run build`, `npm test -- --run`, `npm run docs:check`, `npm run pack:check`, and hermetic `npm run smoke:pack`. Commit deletion and validation evidence; do not mark live hosted/private-image checks passed if still pending.

## Task 18: Modernize release and prove the exact installable artifact

**Files:** Rewrite `.github/workflows/{ci,release}.yml`,
`scripts/smoke/{verify-packed-install,verify-registry-install}.sh`,
`scripts/release/{preflight,publish-impact,capture-publish-evidence}.ts` as needed;
delete `scripts/release/auto-version.ts` and obsolete tests;
update `.changeset/config.json`, CHANGELOG and maintainer release docs.

**Interfaces:** Release input is explicit Changesets major/prerelease intent and an
exact commit/tag. Package evidence records all package versions/tarball hashes and
the validation matrix. Retry resumes the same version; no implicit patch increment.

- [ ] Add release tests for non-main dispatch failing before publish, stale run, concurrent trigger, partial package publication, repeat publish, changed tarball, major/prerelease selection and independent initializer dependency resolution.
- [ ] Resolve the root Apache-2.0 versus package MIT declaration with the maintainer before release; align package metadata and shipped license files with that decision, without silently changing legal terms.
- [ ] Run release tests to show the old behavior fails, then implement pre-publication ref/version checks, non-canceling serialization, OIDC, registry checks for every package, and exact-version tarball verification.
- [ ] Test packed initializer through an isolated local registry with no global runtime, fixture HOME, empty credential helpers and only controlled network routes. Test Linux/macOS/Windows and chosen Node 24/26 floors; verify install scripts/native binary requirements match the chosen runtime port.
- [ ] Add scheduled dependency/adapter-fixture checks with no live user data, explicit capability version reporting, and redacted retained test evidence. Update pinning/upgrade docs; automation must not silently update user runtime code.
- [ ] Run the full release gates against the final versioned artifact. Prepare a `2.0.0` prerelease candidate and changelog for review; publish only after explicit authorization. Verify authorized hosted badge/private rendering separately before claiming that support.

## Final acceptance checklist

- [ ] No Gist API/network destination or mandatory global runtime remains.
- [ ] Clean initializer and fresh-clone activation each work through their documented single command.
- [ ] Same-repo contributors synchronize through normal Git access; forks never silently write upstream.
- [ ] Concurrent/offline/crashed writers converge without data loss or duplicate usage.
- [ ] Source identity, snapshots, fork inheritance, mixed models and token dimensions satisfy the adapter contract tests.
- [ ] User Git operations and existing hooks preserve behavior on all supported platforms.
- [ ] Unknown or unsupported data stays visible as uncertainty; no zero/complete/billing fiction.
- [ ] Public/private state separation holds across sync, diagnostics, uninstall, and packaging.
- [ ] SVG/report correspond to the same input hash as the accepted ledger transaction.
- [ ] Rate-card snapshot, coverage limits, trusted configuration authority and explicit upgrades are documented.
- [ ] Performance results and the complete packaged artifact matrix are recorded.
- [ ] Live hosted/private-image claims are backed by authorized evidence, or are explicitly excluded from release scope.

## Planning review

The design received an independent builder check. Four material gaps were resolved:
canonical data-branch policy and explicit promotion, public versus local coverage,
current-catalog valuation, and explicit checkout remote/fork binding. The reviewer
reported no important questions remaining in those areas after revision.

Self-review maps every design section to a task: product/storage 1–5/9;
automation/runtime 10–12; accounting 2–3/6–8; modern agents 13–14;
collaboration/forks 4/9/15; pricing/rendering 3; CLI/ownership 11/16;
security/performance/platform 1/5/9/17; release/deletion 17–18.

Recommended execution: sequential vertical slices with targeted independent reviews
of the accounting, transport, hook, and release boundaries. Parallelize only the
provider tasks after shared contracts are fixed. Review the design and feasibility
results before committing to private-image support or exact accounting for additional
agents. Implementation should not start merely because this plan exists.
