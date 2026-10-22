# Task 3 implementation report

Status: DONE. No live publishing, pushes, credential probing or real agent-history reads.

## Implemented

The new repository-owned accounting pipeline runs beside the retained v1 code.
The v1 estimator and existing command call sites are unchanged, pending Task 17.

- `ledger/reduce.ts`: deterministic strict public-record reduction; validates
  repository metadata, deduplicates immutable hashes, sorts all output, and binds
  metadata plus the complete unique record set into `inputSetHash`. Counts copied
  native requests once, independent child requests separately, and certified
  cumulative revisions once. Unknown or incompatible evidence becomes a visible
  conflict. Token sums are decimal integer strings backed by BigInt arithmetic.
- `ledger/controls.ts`: validates observation/control supersession and correction
  closure before reducing evidence. Rejects dangling, cross-unit, cross-coverage,
  cross-provider, cross-representation and cyclic edges. Causal includes undo
  excludes, active concurrent exclusion wins, and downward corrections can chain.
  Concurrent distinct correction replacements conflict. Iterative graph validation
  handles a 12,000-control history without JavaScript call-stack exhaustion.
- `ledger/validate-tree.ts`: strict actual Git blob type/mode/path, per-object byte
  cap, UTF-8/JSON, canonical record bytes/hash/path, correction closure, catalog
  pin and regenerated artifact validation. Duplicate names and stale/tampered
  derived artifacts are rejected. Full trees are not contribution envelopes.
- `pricing/catalog.ts`, `pricing/price.ts`: exact registered vendor/model cards,
  standard text tariff scope, explicit cache creation TTL rates, dated valuation,
  validated catalog hash, BigInt rational arithmetic and decimal integer micro-USD
  output. Unknown models, dimensions and missing nonzero tariffs are unpriced.
  No fuzzy aliases, normalization heuristics, runtime scraping or network access.
- `render/svg.ts`, `render/report.ts`, `render/summary.ts`: all artifacts derive
  from the same validated reduction and selected catalog. Fixed geometry and XML
  escaping preserve Unicode without executable or external SVG content. Summary
  exposes coverage/conflicts, known token subtotal, unknown-token units and pricing
  coverage. The report always says repository-wide completeness is unknown and
  describes the current-catalog API-equivalent valuation, not actual billing.
- `packages/core/resources/pricing/catalog.json`: human-readable mirrored version 1
  catalog snapshot. The compiled code embeds the bootstrap card data so runtime
  does not depend on package resource discovery; the JSON copy is audit material.
- Public core exports expose the new reducer, controls, strict tree validator,
  catalog/pricing APIs and renderer. Protocol notes document integration rules.

## Public APIs and integration contracts

`reduceLedger(records: readonly PublicRecord[], meta: LedgerMeta,
resolveContract?: ContractResolver): ReducedLedger` uses the default conservative
registry unless given a code-owned fixture-certified resolver. The optional third
argument is compatible with the Task 2 immutable registry's resolver. Provider
contracts own revision/epoch/meter-layout compatibility. The reducer independently
guards provider, representation and coverage identity before consulting them.
Cumulative sequences are never ordered merely from their string syntax. The
synthetic certified comparator in tests checks identity, epoch, meter layout and
same-sequence content; real providers remain uncertified until adapter tasks.

`ReducedLedger` exposes sorted records and corresponding sorted hashes, metadata
hash, input-set hash, unit decisions, recorded/included/excluded/conflict/partial
counts, decimal `knownTokens`, `unknownTokenUnits`, and constant
`repositoryCompleteness: "unknown"`. Conflicting units contribute no meters.
The known token subtotal can remain zero with unknown units; it is marked known
rather than advertised as a complete zero.

`priceMeters(meters: readonly MeterSegment[], catalog: PriceCatalog): PriceResult`
returns `knownMicroUsd` as a decimal integer string, `pricedUnits`, `unpricedUnits`
and `catalogHash`. Here units mean supplied meter segments. The renderer additionally
reports priced/unpriced segments and fully/partly/unpriced included accounting
units separately. An accounting unit is fully priced only if all its segments are.
Exact rational segment amounts are added before a single half-up micro-USD rounding.
This preserves arithmetic beyond `Number.MAX_SAFE_INTEGER` without overflow.

`renderArtifacts(ledger: ReducedLedger, meta: LedgerMeta,
catalog?: PriceCatalog): Map<string, Uint8Array>` returns the complete sorted tree:
`meta.json`, `catalog.json`, `summary.json`, `badge.svg`, `README.md`, and canonical
sharded observation/control blobs. Explicit catalog input must be the accepted
data-branch catalog; the shipped default is bootstrap only. A catalog version/hash
or metadata-binding mismatch stops rendering. Summary, SVG and report include the
same input-set hash; there are no scan clocks or no-op-only changes.

`validateLedgerTree(entries: readonly PublicTreeEntry[],
resolveContract?: ContractResolver)` returns `{ meta, catalog, records, ledger,
artifacts }`. Entries carry actual path, Git mode/object type and bytes. This API
validates a complete remote tree, including generated bytes; it does not silently
repair stale or malicious artifacts. Transport must use the same certified registry
when validating trees with certified cumulative evidence.

## Controller-approved protocol completions and rulings

1. Added required nullable `toolInput` and explicit included/separate/unknown tool
   overlap semantics. Included tool counts must be a subset of known input. The
   synthetic protocol fixture explicitly certifies absent tool input as measured
   zero; unreported dimensions remain null. Separate nonzero tool input remains
   unpriced without a tariff. Provider totals including additional categories use
   provider-defined total semantics. Updated testkit and protocol documentation.
2. Extended exact model identity registry to `gpt-4.1-mini` and
   `claude-sonnet-4-6`, alongside `gpt-5.4-mini`. Vendor/model pairs are validated.
3. Incoming envelopes remain capped by Task 2 `validateEnvelope` at 10 MiB/10,000
   objects. These caps do not apply to the complete accepted ledger tree/history.
   A roundtrip test validates 10,001 legitimate accounting units and 10,006 tree
   blobs. Transport budgets/cancellation remain a later transport responsibility.
4. Multiple active cumulative unit keys claiming the same provider/coverage stream
   are quarantined because a same-unit comparator cannot certify disjointness.
   Multiple request keys remain independent. Explicit exclusion removes that unit
   from the active overlap check.
5. No universal cumulative meter-array layout rule was invented. Compatibility
   belongs to each certified provider comparator; production defaults remain
   incomparable. Tests inject only a synthetic fixture-certified contract.

## Primary-source pricing evidence

Retrieved official primary sources on 2026-10-22:

- https://developers.openai.com/api/docs/models/gpt-5.4-mini — exact model identity;
  standard text input/cached-input/output USD rates per million: 0.75/0.075/4.50.
- https://openai.com/index/gpt-4-1/ — exact GPT-4.1 mini identity, standard text
  rates 0.40/0.10/1.60 and no extra long-context rate for the family.
- https://platform.claude.com/docs/en/models/sonnet-4-6/overview — canonical
  `claude-sonnet-4-6`, standard input/output 3/15, cache read 0.30, five-minute
  creation 3.75 and one-hour creation 6 USD per million tokens; listed 1M context.

The catalog is narrow and audited, not a claim of adapter support. API-equivalent
standard text valuation excludes regional uplifts, batch/priority service tiers,
modality-specific rates and per-tool charges. Unsupported dimensions/tariffs remain
unpriced. Source URLs are a strict allowlist, not arbitrary public metadata.

## TDD evidence

Tests were written before the new pipeline modules. Initial command:

`python3 .superpowers/sdd/2026-10-22-repo-native-refactor/run-isolated.py npm test -- --run packages/core/src/ledger/reduce.test.ts packages/core/src/pricing/price.test.ts packages/core/src/render`

RED: three suites could not import the new, absent implementation modules. This was
an initial missing-module failure rather than an assertion-level RED. After adding
the implementation, the first complete focused run passed 27/27 tests.

Additional assertion-level RED/GREEN cycles caught and fixed specific behavior:

- Tool-input protocol: `... npm test -- --run packages/core/src/domain/usage.test.ts`:
  RED 1 failed/16 passed (`expected false to be true` when the new tool overlap
  shape was rejected); GREEN 17/17 after schema/model and synthetic fixture updates.
- Independent accounting guard: `... npm test -- --run packages/core/src/ledger/reduce.test.ts`:
  RED a deliberately equal-returning resolver incorrectly selected 100 tokens from
  different coverage identities; GREEN after reducer-owned coverage guards.
- Compact formatting: `... npm test -- --run packages/core/src/render/svg.test.ts`:
  RED three cases exposed double rounding (`1000K` instead of `999K`/`1M`, and a
  one-billion-unit error at huge magnitudes); GREEN 10/10 with exact integer
  rounding and suffix promotion.
- Full-tree boundary regression: with the old envelope cap temporarily restored,
  `... npm test -- --run packages/core/src/render/artifacts.test.ts -t 'above the incoming batch'`
  failed `too-many-objects`; removing the erroneous full-tree cap passed the
  10,001-record tree roundtrip. This mutation run verifies the boundary regression.
- Deep graph: `... npm test -- --run packages/core/src/ledger/controls.test.ts`:
  RED `RangeError: Maximum call stack size exceeded` on 12,000 controls; GREEN 2/2
  after iterative cycle validation, including an explicit cyclic graph rejection.
- Cumulative coverage overlap: `... npm test -- --run packages/core/src/ledger/reduce.test.ts`:
  RED incorrectly returned 140 tokens/0 conflicts for two cumulative unit keys
  claiming one stream; GREEN 10/10 after shared-coverage quarantine.

Property-style tests shuffle and duplicate sets over 32 deterministic seeds and
check literal totals in addition to result equality. Covered examples include
100 + copied 100 + new 50 = 150; parent 100 + child 40 = 140; certified cumulative
100 then 150 = 150; mixed representations, causal exclusion/re-inclusion,
downward correction, concurrent corrections, unknown tokens/models/dimensions,
cache TTLs, exact mixed-model pricing, huge arithmetic, Unicode/XML injection,
missing tariffs, catalog pin changes, no-op replay, and hostile tree entries.

## Final verification evidence

All commands use isolated synthetic HOME/Git configuration through `run-isolated.py`.

- Full retained suite on installed Node 22.14.0:
  `... npm test -- --run` — **56 files, 422 tests passed**, exit 0, 4.39 seconds.
  This full run preceded the final two deep-graph tests and cumulative-overlap test.
  Per controller instruction it was not rerun after those focused changes.
- Final affected coverage on Node 22:
  `... npm test -- --run packages/core/src/ledger packages/core/src/pricing packages/core/src/render packages/core/src/domain/usage.test.ts`
  — **9 files, 60 tests passed**, exit 0. The requested ledger/pricing/render scope
  is included, with v1 estimator tests still passing on the installed runtime.
- Node 24.0.0 and Node 26.0.0, using downloaded existing absolute executables:
  `... <node> node_modules/vitest/vitest.mjs run packages/core/src/ledger packages/core/src/pricing/price.test.ts packages/core/src/render packages/core/src/domain/usage.test.ts`
  — **8 files, 56 tests passed on each**, exit 0; no new-pipeline warnings.
- `... npm run typecheck` — exit 0, including after final reducer/graph changes.
- `... npm run build` — exit 0. Final typecheck regenerated the same project outputs
  after the final focused changes.
- `... npm run docs:check` — exit 0 after protocol additions.
- `git diff --check` — exit 0.

Known retained-v1 validation limits, explicitly not omitted:

An initial cross-runtime invocation included all pricing tests. On both Node 24
and 26 it returned **58 passed/2 failed**, because the installed v1
`better-sqlite3` addon is built for Node 22 ABI 127, while these runtimes require
ABIs 137 and 147. The failing tests were both in `pricing/estimate-cost.test.ts`:
`hydrates Codex usage from rollout token_count events` and
`falls back to rollout turn_context model when Codex db model is missing`.
No reinstall/rebuild was attempted. The controller confirmed this known retained-v1
limit, slated for Task 17 removal, and approved the subsequent new-pipeline-only
runtime scope above. The full retained Node 22 suite also emitted the already
accepted SQLite experimental warning; unrelated logging/output was not changed.

No package manifest/release behavior changed, so package release checks were not
triggered. No publishing commands were run.

## Self-review and remaining integration limits

- All production modules are focused and under 120 lines; no unrelated v1 module
  was refactored. Removed test `any` casts and reviewed all public output fields.
- Fixed independent coverage checks, compact double rounding, deep graph recursion,
  full-tree envelope misuse and multiple-cumulative-stream overlap during review.
- Real cumulative adapters are intentionally uncertified; future adapter tasks must
  supply fixtures and public-evidence comparators before ordering real snapshots.
- Rate support is deliberately limited to three exact models and standard text
  valuations. Additional model IDs/rules need primary-source evidence and tests.
- Transport owns cancellation/time budgets and should incrementally index accepted
  data rather than repeatedly traverse the complete tree in hooks. The current
  reducer is pure full-snapshot reduction, as specified; no claim of a completed
  100,000-unit transport benchmark is made by this task.
- Sync must pass the accepted data-branch catalog and the same certified registry
  to reduction/tree validation. It must atomically use the returned complete map.
- The JSON catalog resource is an audit mirror of compiled bootstrap data; package
  resource inclusion and final package metadata remain Task 18 concerns.

## Files changed

- `packages/core/src/ledger/{reduce,controls,validate-tree}.ts`
- `packages/core/src/ledger/{reduce,controls}.test.ts`
- `packages/core/src/pricing/{catalog,price,index}.ts`, `price.test.ts`
- `packages/core/src/render/{svg,report,summary}.ts`
- `packages/core/src/render/{artifacts,svg}.test.ts`
- `packages/core/resources/pricing/catalog.json`
- `packages/core/src/domain/{capabilities,usage}.ts`, `usage.test.ts`
- `packages/core/src/index.ts`
- `packages/testkit/src/provider-fixtures.ts`
- `docs/superpowers/specs/2026-10-22-accounting-wire-protocol.md`
- This report.
