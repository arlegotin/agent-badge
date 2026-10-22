# Gemini saved-success accounting contract

Inspected on 2026-10-22. Certification is limited to synthetic fixtures of source
revision `09d81bf116b6f0ef084731dc996aa9d56438bb70`. Its
[CLI package](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/cli/package.json)
identifies `0.67.0-nightly.20261020.gb041de017`. No installed agent was observed,
and this development snapshot establishes no released-version range. The reader
recognizes the pinned saved JSON/JSONL shapes; unrelated conversational exports,
unknown records, malformed contracts and unsupported registries remain visible.

## Private discovery and provenance

[Storage](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/config/storage.ts)
uses `projects.json` in the runtime root, mapping absolute project paths to short
identifiers through the
[project registry](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/config/projectRegistry.ts).
Saved sessions live in `tmp/<identifier>/chats/session-*.jsonl` or legacy `.json`;
subagent JSONL files live one directory below `chats`. The implementation reads
only that registry and allowlisted session files. It never initializes storage,
runs migration, invokes an agent or reads adjacent credentials/settings.

[Paths](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/utils/paths.ts)
uses `GEMINI_CLI_HOME` as the enclosing home, with `.gemini` underneath. The
`sandbox-exec` runtime uses `.cache/.gemini`. Explicit enrolled roots and the
adapter's `defaultHome` are runtime roots themselves. Source lines 318–319 hash
the exact project-root string with SHA-256. The registry key is preserved verbatim
for this comparison; it is not replaced by a canonicalized path or inferred from
the directory identifier. Session `projectHash` must match that registry path.
Multiple mappings to the same identifier, unsafe identifiers and symlinked
registry/session directories are refused. Git membership and worktree attribution
still pass through the common collection resolver; a local mapping alone cannot
enroll a foreign transcript or establish membership in another clone.

## Receipts and partial coverage

[Types](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/services/chatRecordingTypes.ts)
define saved metadata, message records, `$set.messages` checkpoints, `$patch`
and `$rewindTo`. The
[writer](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/services/chatRecordingService.ts)
creates durable message UUIDs; repeated IDs replace conversational messages.
Resume and JSON migration preserve those IDs. Accounting keys therefore use the
message ID independently of filename, session or rotation. Identical usage copies
collapse; different numeric/model meters on the same ID remain conflicting
evidence. Rewinds, patches and removals never retract recorded incurred usage.
A final legacy JSON snapshot cannot recover deleted history.

Writer lines 1079–1160 can re-emit the same pending message after adding tokens.
Tokenless messages produce no immutable receipt. An all-zero token object also
produces no receipt: the writer applies `upstreamCounter ?? 0`, so it cannot prove
that wholly absent upstream usage was measured zero. A genuine zero-use message consequently also has no counted receipt. Both cases retain partial
source coverage and can later yield a positive usage receipt on the same ID.

The
[successful stream](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/core/geminiChat.ts)
flushes buffered usage from the successful attempt at lines 1759–1790. Failed
attempts can be absent; upstream missing dimensions can have become zero. Every
emitted receipt and scan is consequently partial, even if its saved counters are
internally consistent. This is recorded successful usage, never complete billing
or proof of zero spend. No session aggregates or invented IDs create receipts.

Following the [API usage metadata](https://ai.google.dev/api/generate-content#UsageMetadata),
`input` includes cached tokens: noncached input is `input-cached`, cache read is
`cached`, visible output is `output`, reasoning is `thoughts`, and tool prompt
input is the separate `toolInput` dimension. Cache is not added again. When all
counters exist, `total=input+output+thoughts+tool`; otherwise total must cover the
known sum, and absent optional dimensions remain null. Negative, unsafe, subset
and total contradictions are rejected. Cache-creation dimensions stay unknown.

Exact model IDs come from the pinned
[models](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/config/models.ts)
and [default model configs](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/config/defaultModelConfigs.ts).
Selectors and arbitrary deployment suffixes cannot establish a resolved model.
All added Google identities remain unpriced. The current catalog does not certify
Gemini prompt tiers, modality, thinking, cache storage or tool tariffs described
by the [pricing page](https://ai.google.dev/gemini-api/docs/pricing).

## Collection and wakeups

Ordinary and bounded automatic collection register the same adapter and contract.
The fourth scan argument binds checkpoint repository, normalization and attribution
scope. The shared bounded reader verifies physical epoch and prefix bytes before
resuming. Rewrites and scope/mapping changes force replay with a new batch source
generation; private continuation holds only hash/metadata-validity state. Bounds:
16 MiB default parse bytes (512 KiB automatic), 256 KiB JSONL records, 1,000
observations per batch, 1 MiB registry, 10,000 mappings/files and 20,000 discovery
entries. Oversized JSON snapshots remain partial; large `$set.messages` lines
replay atomically in the next batch when the current batch lacks room. A single
checkpoint exceeding 1,000 messages is consumed with explicit unsupported-source
coverage and no receipts from that checkpoint, allowing later records to progress.

The optional project `.gemini/settings.json` hook uses `AfterModel`, with a native
10,000 ms timeout and Badge's existing two-second total budget. The pinned
[command runner](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/hooks/hookRunner.ts)
selects `hookConfig.timeout` at line 313 and passes it directly to `setTimeout`
at lines 370–399; its default is 60,000 ms. This unit differs from the existing
Codex/Claude native timeout of 10 seconds. Its
[documented config](https://geminicli.com/docs/hooks/) requires native review/trust;
setup never grants that trust. Configuration/removal use the existing exact
ownership transaction, pending worktree binding and dedicated integration lease,
including Gemini in the four-file recovery allowlist. User settings and telemetry
destinations are preserved.

[Hook types](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/hooks/types.ts)
and the [translator](https://github.com/google-gemini/gemini-cli/blob/09d81bf116b6f0ef084731dc996aa9d56438bb70/packages/core/src/hooks/hookTranslator.ts)
supply no durable receipt ID or full usage dimensions. The approved private
bootstrap retains only the provider and absolute transcript routing path; it
rejects Gemini Stop/SubagentStop and other providers' AfterModel. The target must
already be discovered/enrolled. Hook counters/content/session IDs are discarded,
never counted or persisted. A wakeup preceding saved usage leaves reconciliation
for later wakeups/manual collection. Native Gemini event execution and trust UI
were not exercised; tests use synthetic payloads and the actual approved runtime.
