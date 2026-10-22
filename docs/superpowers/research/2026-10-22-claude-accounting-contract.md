# Claude identity coverage and unsupported numeric accounting

Decision recorded October 22, 2026: **omit unverified native amounts**. The native
reader records documented response identity with all public numeric dimensions
null and partial quality. No inspected historical JSONL discriminator certifies
that its counters represent consumed usage. Repeated rows, `stop_reason:end_turn`,
mtime stability, componentwise dominance and cost-state presence cannot certify
placeholder provenance. This supersedes earlier stable-input/subtotal proposals.

## Primary evidence and narrow pins

- [SDK cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking)
  documents shared `message.message.id` across blocks of one response and warns
  that assistant usage can retain message-start output placeholders.
- [Monitoring joins](https://code.claude.com/docs/en/monitoring-usage#event-correlation-attributes)
  maps telemetry request IDs to `requestId`; entry UUIDs identify persisted blocks,
  not independently consumed requests.
- Python SDK v0.2.171 source pin
  `7b790c7fa8ebc12093323ab9599e7ffe664822ec`:
  [fork transform](https://github.com/anthropics/claude-agent-sdk-python/blob/7b790c7fa8ebc12093323ab9599e7ffe664822ec/src/claude_agent_sdk/_internal/session_mutations.py#L348)
  remaps entry/session/parent UUIDs but leaves nested message and request IDs.
  Inference: these original IDs survive this specific SDK transform. This is not
  certification of all CLI fork behavior or numeric persistence.
- [Streaming usage](https://platform.claude.com/docs/en/build-with-claude/streaming#event-types)
  includes cumulative delta counters; official examples change input from2679 to
  10682, and input/cache counters can change during server-side loops. Therefore
  start-derived input/cache cannot be treated as immutable either.
- [Cache TTL contract](https://platform.claude.com/docs/en/build-with-claude/prompt-caching#1-hour-cache-duration)
  makes 5m/1h writes parts of aggregate cache creation, never additive to it.
  Missing TTL is unknown, not an inferred 5m write.

## Official CLI 2.1.307 synthetic loopback probe

This evidence was produced in the earlier isolated research stage; Task7 did not
execute a provider. The official darwin-arm64 npm tarball was downloaded without
install scripts. Verified package SHA512:
`bBNAygs3y8j4jkwmBoq9PyYNHaYj4KsJ5Ca2dtj8CGeUAiFsTCOzzwNMbXHhMAhAkg7m0jXUo2S1YDQmYh1gUw==`.
Native executable SHA256:
`5b113a7752119470f1da419cb0e608af3361cae25b614216b13022093958fb2a`.
[Public tarball](https://registry.npmjs.org/@anthropic-ai/claude-code-darwin-arm64/-/claude-code-darwin-arm64-2.1.307.tgz).
No executable is tracked.

The probe used an empty inherited environment, temporary HOME/config/repo,
a dummy key and loopback endpoint, empty tools/settings sources and strict empty
MCP configuration. CLI flags included `--bare --safe-mode --restricted`,
`--setting-sources '' --strict-mcp-config --mcp-config '{"mcpServers":{}}'`,
`--tools '' --no-chrome`, a synthetic system/user prompt, an explicit model,
`--max-turns 1 --output-format stream-json --verbose --include-partial-messages`.
macOS sandbox-exec permitted only its one localhost destination port, denied all
other outbound destinations, binding/listening, real home/workspace/managed-config
reads and securityd. A preflight probe connected to the allowed port and observed
EPERM (errno1) for another loopback port and a TEST-NET external address.
No real API/model calls or user histories were involved.

Fake SSE supplied input101, cache-read13, cache-write19 (5m7/1h12), start output3,
final delta output17, two content blocks. Success exited0 after one local request;
stdout assistant callbacks retained3, while two persisted entries shared native
message/request IDs with distinct entry UUIDs and output17. The premature-EOF
variant omitted `message_delta` and `message_stop`. It exited1 after four local
retries and persisted placeholder output3 **with `stop_reason:end_turn`**, plus a
separate flagged API error. Reused fake IDs do not certify retry accounting.
Exit cost-state aggregates had no per-request identity or positive finality marker;
the failed summary included the placeholder counts. Never add those totals.

Minimal sanitized [success fixture](../../../packages/testkit/fixtures/claude/native-2.1.307/success.jsonl)
and [placeholder fixture](../../../packages/testkit/fixtures/claude/native-2.1.307/placeholder.jsonl)
preserve real-format accounting/identity fields. Entry IDs/times/cwd are synthetic,
text content was removed. Both yield identical all-null public coverage. No release
range, crash/interrupt/compaction completeness or general upstream billing claim
was established. Web documentation was inspected October22 and remains mutable.

## Implemented boundaries

Native `message.id` is the consumption identity, independent of home, file,
entry/session UUID, request alias and fork. Request ID alone is unsupported;
missing request ID does not invalidate a documented message identity. Alias
inconsistency/overflow is finite local uncertainty, never a new unit key. Public
meters retain neither model nor vendor: changing provisional model recognition or
amounts cannot make conflicting immutable projections. Public `revision:final`
certifies this immutable identity-only projection, not native numeric completion.
Flagged error/synthetic rows and aggregate results do not mint receipts.

Normalized provisional input/cache/output and exact allowlisted model identities
are retained only in strict privateEvidence (one meter, <=8192 serialized UTF-8
bytes). Its presence structurally requires every public-facing amount to be null
and partial quality. No transcript/prompt/tool content is retained. Sanitizer drops
evidence; public schema rejects it; store rejects numeric promotion; rendered
artifacts carry unknown counts and explicit unknown-only badge labels. Raw paths,
IDs and aliases remain local. Known zero remains distinct.

Discovery enumerates only enrolled config roots' `projects` trees, so custom names,
truncated slugs, separate background/team sessions and nested subagents need no
cwd-name inference. Explicit roots precede CLAUDE_CONFIG_DIR/default; multiple
homes canonicalize. Ordinary symlinks are skipped. No settings, histories outside
that tree, credentials or transcript bodies are used for discovery. Per-request
cwd is private attribution evidence, never a hook-derived reassignment.

Bounded scans retain byte offsets/prefix hashes and physical epochs through the
shared source-file reader. Logical generations survive verified appends and
chain on resets. Continuation is provider/reader/scope-bound, <=64KiB including
its serialized envelope, with at most128 private aliases; overflow drops aliases
and keeps explicit uncertainty. Partial final lines stay in source and are retried.
Task8 must hold the store lock across latest candidate, scan and commit(batch.source).
Stop/SubagentStop/SessionEnd are targeted wakeups only; Task12 owns installation
and payload validation. Never launch/resume an agent or add hook summaries to
transcript coverage.

The separate `certifiedClaudeImport` fixtures certify normalized imported amounts,
not native CLI counters: parent100+child40=140; original100+copied100+new50=150;
mixed exact models with supplied synthetic cards=1800 micros through production
sanitize/reduce/price functions. Future delta-based numeric collection needs a
new positive provenance contract and reconciliation plan, not a JSONL heuristic.

## Exact identity-only model additions

`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` map exactly to anthropic
using the [official model ID table](https://platform.claude.com/docs/en/models/overview)
and [Claude Code model configuration](https://code.claude.com/docs/en/model-config).
The latter describes Opus5.5 defaults from2.1.280 with account/backend exceptions.
Selectors/substring aliases are not execution identities. These three IDs remain
unpriced: the inspected base prices do not certify every cache/tariff condition
under the existing same-rate catalog. Identity recognition certifies neither
availability, numeric source semantics nor subscription billing.
