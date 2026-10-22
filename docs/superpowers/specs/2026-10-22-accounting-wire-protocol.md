# Accounting wire protocol, normalization 1

Implemented by Task 2 of the [repository-native refactor](../plans/2026-10-22-repo-native-refactor.md).
The [approved design](2026-10-22-repo-native-design.md) remains the product contract.

## Public boundary

`parseObservation` validates private normalized receipts. `sanitizeObservation`
projects them to the strict public observation schema. `canonicalJson` validates
again before producing sorted-key JSON without whitespace or a trailing newline.
`recordHash` is SHA-256 of those UTF-8 bytes. Consumers must use the safe parser
functions for diagnostics; raw Zod errors may contain untrusted field names.

Public observations use schema version 2 and normalization version 1. They contain
only repository UUID, opaque unit/coverage keys, registered provider, representation,
revision evidence, superseded content hashes, meter segments, and quality. Controls
use the same versions and repository namespace. Exclude/include controls target an
opaque unit key; their `supersedes` list identifies causally replaced controls.
Correction controls additionally name replaced and replacement observation hashes.
No control accepts free-form notes. Reducer conflict and correction rules belong
to Task 3.

Unknown model/vendor identities and unreported meter dimensions are `null`.
Measured zero remains `0`. `input`, `output`, and `total` preserve the reported
dimensions; segment semantics specify cache/reasoning overlap and total meaning.
Never sum all dimensions. There is no price field or implied free-inference claim.
The initial exact-model allowlist contains only `gpt-5.4-mini`, grounded in the
[official model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
already cited by the audit. New exact identities require primary-source evidence;
rate cards remain a separate versioned catalog responsibility.

Public parsers reject unknown fields, future versions, unsafe counters, and
inconsistent known subsets. Individual public records are limited to 256 KiB.
Envelope limits are 10 MiB and 10,000 objects; labels are limited to 64 Unicode code
points and valid XML scalars. Exceeding a limit raises a typed diagnostic rather
than truncating meters. Transport must validate actual Git object type `blob`,
mode `100644`, and an enumerated path through `validatePublicBlob`. Content-addressed
paths require the two-character directory to match the digest prefix.

## Native identity and coverage

Opaque keys hash a domain-separated JSON tuple containing protocol, repository
UUID, provider, and native identity. Request and cumulative unit namespaces are
distinct. The UUID is a public namespace, not a secret. Native identities are
provider-owned accounting identities, never invented from prompt text, source
paths, conversation containers, machine identity, or scan time. Local fallback
identities are rejected by the public projection.

Private receipts explicitly choose `coverage: native-request | origin-stream`.
Request-only certified formats can use native-request coverage: its coverage key
is derived from the native request identity. A copied/forked request then produces
byte-identical public content even when its containing conversation changes.

Adapters that can emit requests and cumulative snapshots must use the same stable
origin-stream coverage for both. They must not switch to request-derived coverage
and add an overlapping snapshot. Original provider origin evidence must survive
copies/forks. Unknown origin requires partial/unsupported treatment in the adapter;
uncertain inherited cumulative history is rejected by projection. A cumulative
receipt always requires origin-stream coverage.

## Provider contracts and revision evidence

The baseline registry accepts registered IDs `codex`, `claude`, `gemini`,
`opencode`, `cursor`, `copilot`, and `import`. These IDs identify protocol
namespaces; registration is not a claim of a working or certified adapter.
Every initial contract has identical conservative requirements:

| Evidence | Baseline comparison |
| --- | --- |
| Same repository/provider/unit/coverage, finalized request, equal meters | `equal` |
| Finalized request with unequal meters | `incomparable` (reducer conflict) |
| Different identity or coverage | `incomparable` |
| Any cumulative snapshot | `incomparable` |

Public request revision is `final`. Unordered cumulative evidence is
`unordered:<repository-scoped evidence digest>`, and projection marks it partial.
The strict future-certification envelope is
`certified:<repository-scoped evidence digest>:<nonnegative safe sequence>`.
Its syntax alone confers no certification or ordering. A provider contract must
establish what the epoch/evidence digest and sequence mean through fixtures.
Different epochs/evidence digests remain incomparable. File mtimes, copied-file
offsets, and observation clocks are never universal revision evidence.

`createAccountingRegistry(readonly AccountingContract[])` supplies an immutable,
code-owned override resolver with baseline fallback. It does not mutate global
state or load executable plugins from data. Task 3 can inject the returned
`getAccountingContract` resolver with a synthetic fixture-certified contract for
the cumulative 100-to-150 test. Adapter tasks can use the same seam after source
certification. Comparators must operate only on public evidence, reject different
accounting identities/epochs, and treat same-revision meter disagreement as
incomparable. Production defaults remain uncertified until those tasks land.

## Private parser state

`Checkpoint` includes provider, provider instance, actual source identity/generation,
source schema, reader version, normalization version, repository UUID, and
attribution-policy hash. Its cursor records offset, observed size, content-prefix
hash, and incomplete tail. Source descriptors and checkpoints are private and
never public records. Storage must journal sanitized records durably before
advancing any checkpoint; Task 5 implements that transaction.

## Deterministic reduction and artifacts (Task 3)

`reduceLedger(records, meta, resolveContract?)` validates repository identity,
record deduplication and causal closure before selecting any meters. It returns
sorted records/units, a metadata hash, and an input-set hash of the metadata hash
plus sorted unique record hashes. Decimal integer token totals avoid overflow.
Conflicting units are quarantined; partial totals never imply repository-wide
completeness. A copied native request counts once regardless of replay order.

The optional resolver is a code-owned `AccountingContract` resolver. The reducer
independently guards provider, representation and coverage identity. Certified
comparators must establish compatible meter layouts and epochs, reject
same-revision meter disagreements, and prove a candidate at least as late as all
other candidates before it can replace them. A sequence-shaped revision string
alone cannot order snapshots. All current default cumulative comparators remain
uncertified. There is no generic meter-layout equality rule: a certified adapter
must decide whether its cumulative model segmentation can be compared.

Observation `supersedes` edges must reference existing observations with the same
accounting identity. Control `supersedes` edges must reference existing controls
for the same unit. Cycles and dangling or cross-unit correction references are
invalid. Corrections can decrease totals, must name both replaced and replacement
observations, and preserve replacement identity/coverage. Causally superseded
controls no longer decide inclusion; a causal include can undo an exclude, while
an active concurrent exclude wins. Concurrent incompatible corrections conflict.
Replaced observations stay withdrawn through a causal correction chain.

Meters additionally require nullable `toolInput` and
`semantics.toolInput: included-in-input | separate | unknown`. Included tool input
is a known subset of input, not additional volume; separate tool input remains
separate. For provider totals that include additional separate categories, adapters
must preserve `total: provider-defined`, rather than assert input-plus-output.
Unknown tool input is null. Synthetic fixtures use measured zero only when their
source contract explicitly excludes separate tool input. Nonzero separate tool
usage has no initial tariff and cannot silently disappear into a zero cost.

The exact registered model IDs now include `gpt-5.4-mini`, `gpt-4.1-mini`, and
`claude-sonnet-4-6`. The version 1 catalog snapshot (2026-10-22) uses official
[OpenAI mini rates](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[GPT-4.1 rates](https://openai.com/index/gpt-4-1/), and
[Claude Sonnet 4.6 rates](https://platform.claude.com/docs/en/models/sonnet-4-6/overview).
Rates are standard text token API-equivalent valuations, with explicit cache TTL
creation/read rates and the listed same-rate long-context rule. Other tariffs are
unsupported. This is current-catalog valuation of recorded usage, not historical
invoices or subscription charges.

`priceMeters(meters, catalog)` returns decimal integer `knownMicroUsd`, priced and
unpriced **meter-segment** counts, and the validated catalog hash. BigInt
intermediates preserve exact rational micro-USD; the sum is rounded half up once.
A segment missing a required dimension or nonzero bucket tariff stays unpriced.
The summary additionally exposes segment counts and priced/unpriced **included
accounting-unit** counts; an accounting unit is fully priced only when every
segment is priced. Conflict and exclusion counts remain separate.

`renderArtifacts(ledger, meta, catalog?)` returns the complete sorted public tree
map, including canonical records, metadata, accepted catalog, summary, SVG and
README report. The optional shipped catalog is for bootstrap; synchronization must
supply the accepted data-branch catalog. Metadata version/hash mismatch stops
rendering. Summary, SVG and report bind the same input-set hash and contain no
scan timestamps. The SVG interpolates only escaped text and computed geometry.

`validateLedgerTree(entries, resolveContract?)` validates each path, actual Git
object type/mode, byte limit, schema, canonical content hash, causal closure,
catalog pin and regenerated artifact bytes. Full trees may exceed 10,000 objects
or 10 MiB: `validateEnvelope` limits incoming transport batches, not accepted
ledger size or history. Transport remains responsible for budgets/cancellation
while traversing a full tree. No pruning is implied by either boundary.

Distinct active cumulative unit keys claiming the same provider/coverage stream
are also quarantined: a same-unit revision comparator cannot establish that their
usage is disjoint. Multiple request keys remain independent. An explicit exclusion
removes the excluded cumulative unit from this overlap check. Control supersession
graph validation uses an iterative traversal so deep accepted histories do not
exhaust the JavaScript stack.


## Claude identity-only native projection

The native JSONL contract has no certified numerical provenance. Valid native
message IDs produce immutable partial receipts with constant unknown semantics,
null model/vendor and every numerical dimension null. Request aliases, entry IDs,
provisional usage and source order cannot change this public projection. Flagged
synthetic/error assistants and request-ID-only rows are excluded. Numerical
accounting remains unsupported; numeric normalized/import fixtures are a separate
explicit certification.

Private observations may contain strict `privateEvidence` with kind
`claude-native-uncertified`, nullable bounded requestAlias and exactly one normalized
meter (complete serialized field <=8192 UTF-8 bytes). Evidence requires provider
claude, request representation, partial quality and all public-facing amounts null.
Public schemas reject the field; sanitization omits it. Store journals validate
that invariant. No raw transcript, prompt or tool text is permitted. An evidence
upgrade requires an explicit new provenance/reconciliation contract. Unknown-only
SVG values are usage unknown / cost unknown; measured zero remains distinguishable.
Exact opus/sonnet/haiku5.5 identities map to anthropic independently of pricing and
remain unpriced. Evidence: [Claude contract research](../research/2026-10-22-claude-accounting-contract.md).
