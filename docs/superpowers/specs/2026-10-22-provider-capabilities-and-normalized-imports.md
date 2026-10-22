# Provider capabilities and explicit normalized imports

Task 14 contract, reviewed against official sources on 2026-10-22. Synthetic fixtures
certify our boundaries; no native tool, private history, credential or telemetry setting
was accessed. These limits apply to the breaking repository-native replacement.

## OpenCode source gates

`createOpenCodeAdapter({ exports: [{path, version, format}] })` reads only supplied
absolute local files. `format` is `cli` or `api`; API input means a saved response
file, not network access. `opencodeAdapter` only checks data-root presence by default.
Discovery never invokes `opencode`, opens a database, attaches/starts a server,
changes persistence, probes credentials or creates a listener. Enrolled roots indicate
native-store presence, not permission to guess native schemas.

The exact researched release is [v1.19.3](https://github.com/anomalyco/opencode/releases/tag/v1.19.3).
Its [export command](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/cli/cmd/export.ts)
is `opencode export <sessionID> --sanitize` and emits `{info,messages:[{info,parts}]}`.
The [processor](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/session/processor.ts)
repeats assistant usage in step-finish parts. The
[session fork implementation](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/session/session.ts)
rewrites IDs without a durable original map; [import](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/cli/cmd/import.ts)
can preserve IDs while rebinding project/directory. Project ID, title suffix and
current worktree path cannot certify original execution or additive new usage.

The v2 development pin is `c93aaae37157d785f76a8e9a9243a6560e286468`, whose
[package](https://github.com/anomalyco/opencode/blob/c93aaae37157d785f76a8e9a9243a6560e286468/packages/cli/package.json)
says `2.1.2`; this is not a released-version certification. Its
[CLI export](https://github.com/anomalyco/opencode/blob/c93aaae37157d785f76a8e9a9243a6560e286468/packages/cli/src/commands/handlers/session/export.ts)
is `opencode session export <id> --sanitize` and emits `{info,messages}`;
[HTTP API](https://dev.opencode.ai/v2/docs/api) exports wrap it in `{data:...}`.
The API is experimental; CLI connection resolution may start a managed server.
[Messages](https://github.com/anomalyco/opencode/blob/c93aaae37157d785f76a8e9a9243a6560e286468/packages/schema/src/session-message.ts)
have `type`, model references and usage per message; v1 uses nested `info`/`parts`.
Both normalize disjoint input/cache/output/reasoning dimensions. Stored cost is local
[model-table arithmetic](https://github.com/anomalyco/opencode/blob/c93aaae37157d785f76a8e9a9243a6560e286468/packages/core/src/session/usage.ts),
not authority over the repository's selected catalog-equivalent valuation.

The v2 [fork projector](https://github.com/anomalyco/opencode/blob/c93aaae37157d785f76a8e9a9243a6560e286468/packages/core/src/session/projector.ts)
copies inherited usage into rewritten message identities. The
[transfer importer](https://github.com/anomalyco/opencode/blob/c93aaae37157d785f76a8e9a9243a6560e286468/packages/core/src/session/transfer.ts)
does not restore reliable fork/import origin. Missing `fork` fields therefore do not
certify root execution. Both recognized versions return unsupported accounting with
`uncertain-lineage`, zero observations and no retained transcript projection.
Unknown versions/shapes/wrappers return unsupported source. Supplied files are byte
bounded; truncated exports remain partial with no observations.

The [event table](https://github.com/anomalyco/opencode/blob/c93aaae37157d785f76a8e9a9243a6560e286468/packages/core/src/event/sql.ts)
and [step events](https://github.com/anomalyco/opencode/blob/c93aaae37157d785f76a8e9a9243a6560e286468/packages/schema/src/session-event.ts)
may support a future retained-local-execution reader. However,
[Bus persistence defaults off](https://github.com/anomalyco/opencode/blob/c93aaae37157d785f76a8e9a9243a6560e286468/packages/core/src/bus.ts),
and [ordinary CLI server launch](https://github.com/anomalyco/opencode/blob/c93aaae37157d785f76a8e9a9243a6560e286468/packages/cli/src/server-process.ts)
does not enable it. Existing message rows or sequence numbers do not prove event
history. Enabling events now cannot recover old spend and exceeds a reader's scope.
Retained-event accounting requires a separate explicit schema/version/fixture gate.

## Honest capability reporting

`await reportCapabilities(ctx, options?)` reports all seven registered integrations.
Use an empty `ctx.enrolledRoots`; use `options.roots[provider]` for per-provider roots,
otherwise standard local roots are used. Context roots cannot unambiguously name a
provider and are rejected. `options.home` and `environment` enable isolated discovery.
The report contains provider IDs, safe diagnostics, manifests and explanation codes;
it contains no raw source paths, usage totals or provider payloads. Missing explicitly
enrolled roots remain unavailable; existing empty roots remain detected. A discovered
certified-format candidate means a certified reader is available, not that scanning
has validated that individual file or established complete historical coverage.
The manifest describes the reader's code-owned maximum capability; the top-level
accounting field is unsupported when no certified local candidate is available.

[Cursor hooks](https://cursor.com/docs/hooks) describe `context_tokens` as current
context occupancy. It cannot become accumulated token spend. The
[CLI output reference](https://cursor.com/docs/cli/reference/output-format) does not
certify request token accounting. This boundary does not claim Cursor has no usage
data anywhere. Native Cursor accounting remains unsupported pending its own fixture gate.

[Copilot CLI OTel](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring)
now documents optional per-request spans with model/identity and token counters,
including JSONL output, disabled by default. Parent spans aggregate child requests;
cost is a multiplier, not currency. A future reader needs producer-version, finality,
identity, cache overlap, fork/retry and repository provenance fixtures. This task
neither enables telemetry nor certifies that format. [Organization/user and PR metrics](https://docs.github.com/en/copilot/reference/copilot-usage-metrics/copilot-usage-metrics)
cannot be apportioned into repository request receipts. Admin API credentials are
outside local source discovery. [Session storage and reindexing](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/chronicle)
do not establish additive token identity; reindexing may synchronize account data.

Both [Cursor](https://cursor.com/docs/hooks) and
[Copilot](https://docs.github.com/en/copilot/reference/hooks-reference) accept compatible
Claude settings/hooks. A compatible payload or `transcript_path` cannot enroll an
unrelated transcript as Claude history. Target hints filter discovered sources and
never grant access; focused regressions reject both cross-tool transcript paths.

## Normalized source import producer API

`parseNormalizedImport(input)` accepts only the strict discriminator
`kind: "agent-badge/normalized-source", schemaVersion: 1, normalizationVersion: 1`.
Task 15 sanitized fork contribution envelopes must use a different discriminator.
Never guess a native export's type or automatically wrap an unsupported native source.
The envelope selects the repository UUID and contains `provenance` plus 1–1000
immutable final `requests`. Limits are 16 MiB per envelope, 128 meter segments per
request, 4096 bytes per framed private identity and 1000 supplied files per adapter.
Meters use the shared normalized dimensions. Unknown dimensions remain null.
Optional nonnegative `providerReportedCostUsd` is diagnostic input only and is
omitted from observations, journal checkpoints and public records; selected catalog
pricing remains authoritative.

Independent producers use `provenance.kind: "independent-request"` with original
`producerId` and `sourceId` UUIDs, bounded `producerVersion`,
`assertion: "original-independent-requests-no-native-agent-usage"`, and
`identity: "preserved-across-copies-and-reexports"`. Each request has `requestId`
and `meters`. The provider becomes `import`; identity is the framed tuple of original
producer/source/request. Copies, filenames, adapter installation and producer versions
never mint new identities. Original namespace and request identity MUST survive
copies/reexports; conflicting numeric/model data under that identity stay conflicts.
The assertion explicitly excludes all native Codex/Claude/Gemini/OpenCode/Cursor/Copilot
usage and native projections. Known native/export shapes and added origin-provider
fields fail strict validation. A dishonest producer can lie about independent origin;
this cannot be automatically verified, and these externally asserted receipts always
remain partial. Renaming unknown native OpenCode identity cannot repair its lineage.

Certified native mappings use `provenance.kind: "certified-native"`, the exact
`provider` and pinned `contract`:

| Provider | Contract | Each request's `identity` |
| --- | --- | --- |
| codex | `codex-token-usage-record-source-pin-86e17e9` | `{threadId,responseId}` preserving original owner |
| gemini | `gemini-saved-jsonl-pin-09d81bf` | `{messageId}` preserving durable writer UUID |

These reuse the native identity helpers and original provider, so native/import
coverage overlaps and deduplicates; disagreement remains a conflict. Other native
mappings, including numerical Claude and OpenCode projections, are rejected. No
native accounting authority is broadened by accepting deliberate producer assertions.

`createNormalizedImportAdapter({provider, paths, nativeAdapter?})` reads only supplied
absolute files and can compose with that same provider's native adapter. It returns
ordinary private source descriptors and scan batches. Envelopes for another provider
or repository yield unsupported with no observations. All imported observations stay
partial, carry the selected UUID, and have null cwd/remote: destination selection is
not invented execution evidence. Producer provenance is retained in a bounded private
checkpoint; original producer/request IDs stay private and only existing scoped
sanitizer hashes reach public usage records.

`normalizedImportOverrides(envelope, {privatePolicy, records, policy})` prepares a
conservative merged private override array. `records` must include validated accepted
shared/local records and complete causal control closure. Existing local choices are
preserved. New choices use private `decision: "attribute"`: they approve destination
attribution, with no authority to reverse shared controls. Active excluded/conflicting
units receive no new choices. Callers persist the merged private policy and feed the
adapter into ordinary `collectUsage`; all storage, reprojection, privacy and reducer
rules stay in that path. Without explicit attribution choices, null-cwd imports stay
ambiguous and do not produce public receipts.

Ordinary replay of unchanged choices cannot emit a shared include. This applies when
a mapped imported request later appears in native history, and when historical
reprojection reuses a saved choice. The collector permits causal reinclude only on an
actual relevant authority-policy edit for the exact prior observation, ignoring
attribution-only choices. Deliberately removing a prior exclude/mapping remains an
explicit undo; no clock or scan-order heuristic establishes intent. Task 16 deliberate
shared reinclude operations must use the current control heads, not routine import
attribution. These are private additions only; the public wire schema is unchanged.
