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
