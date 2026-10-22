import { z } from "zod";
import { lstat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  checkpointScopeSchema,
  parseProtocol,
  privateStringSchema,
  ProtocolError,
  repositoryIdSchema,
  sourceDescriptorSchema,
} from "../domain/capabilities.js";
import type {
  CapabilityManifest,
  Checkpoint,
  ProviderAdapter,
  ProviderId,
  SourceDescriptor,
} from "../domain/capabilities.js";
import { meterSegmentSchema, parseObservation } from "../domain/usage.js";
import { parsePrivateAttributionPolicy } from "../collection/attribution.js";
import type { PrivateAttributionPolicy } from "../collection/attribution.js";
import { parseSharedPolicy } from "../domain/policy.js";
import type { SharedPolicy } from "../domain/policy.js";
import { parsePublicRecord } from "../domain/ledger.js";
import type { PublicRecord } from "../domain/ledger.js";
import { recordHash } from "../ledger/canonical-json.js";
import { resolveControls } from "../ledger/controls.js";
import { sanitizeObservation } from "../ledger/sanitize.js";
import { codexRequestIdentity } from "./codex/identity.js";
import { geminiRequestIdentity } from "./gemini/identity.js";
import {
  DEFAULT_MAX_BYTES,
  emptyHash,
  readSourceFile,
  sourceFileEpoch,
} from "./source-file.js";
export const NORMALIZED_IMPORT_KIND = "agent-badge/normalized-source";
export const NORMALIZED_IMPORT_SCHEMA = "agent-badge-normalized-source-v1";
const common = {
  kind: z.literal(NORMALIZED_IMPORT_KIND),
  schemaVersion: z.literal(1),
  normalizationVersion: z.literal(1),
  repositoryId: repositoryIdSchema,
};
const amounts = {
  meters: z.array(meterSegmentSchema).min(1).max(128),
  providerReportedCostUsd: z.number().finite().nonnegative().optional(),
};
const independent = z
  .object({
    ...common,
    provenance: z
      .object({
        kind: z.literal("independent-request"),
        producerId: repositoryIdSchema,
        sourceId: repositoryIdSchema,
        producerVersion: z.string().min(1).max(128),
        assertion: z.literal(
          "original-independent-requests-no-native-agent-usage"
        ),
        identity: z.literal("preserved-across-copies-and-reexports"),
      })
      .strict(),
    requests: z
      .array(z.object({ requestId: privateStringSchema, ...amounts }).strict())
      .min(1)
      .max(1000),
  })
  .strict();
const codex = z
  .object({
    ...common,
    provenance: z
      .object({
        kind: z.literal("certified-native"),
        provider: z.literal("codex"),
        contract: z.literal("codex-token-usage-record-source-pin-86e17e9"),
      })
      .strict(),
    requests: z
      .array(
        z
          .object({
            identity: z
              .object({
                threadId: privateStringSchema,
                responseId: privateStringSchema,
              })
              .strict(),
            ...amounts,
          })
          .strict()
      )
      .min(1)
      .max(1000),
  })
  .strict();
const gemini = z
  .object({
    ...common,
    provenance: z
      .object({
        kind: z.literal("certified-native"),
        provider: z.literal("gemini"),
        contract: z.literal("gemini-saved-jsonl-pin-09d81bf"),
      })
      .strict(),
    requests: z
      .array(
        z
          .object({
            identity: z.object({ messageId: privateStringSchema }).strict(),
            ...amounts,
          })
          .strict()
      )
      .min(1)
      .max(1000),
  })
  .strict();
export const normalizedImportSchema = z.union([independent, codex, gemini]);
export type NormalizedImport = z.infer<typeof normalizedImportSchema>;
/** Deliberate producer assertions only; strict discriminator forbids native/export or contribution shape guessing. */
export function parseNormalizedImport(input: unknown): NormalizedImport {
  const value = parseProtocol(normalizedImportSchema, input);
  if (Buffer.byteLength(JSON.stringify(value)) > 16 * 1024 * 1024)
    throw new ProtocolError("object-too-large");
  // Framed identities must fit the private observation boundary too.
  for (const request of requests(value))
    if (Buffer.byteLength(request.id) > 4096)
      throw new ProtocolError("unsupported-identity");
  return value;
}
function providerOf(value: NormalizedImport): ProviderId {
  return value.provenance.kind === "independent-request"
    ? "import"
    : value.provenance.provider;
}
function requests(value: NormalizedImport) {
  if (value.provenance.kind === "independent-request") {
    const v = value as z.infer<typeof independent>;
    return v.requests.map((request) => ({
      id: JSON.stringify([
        "normalized-source",
        v.provenance.producerId,
        v.provenance.sourceId,
        request.requestId,
      ]),
      meters: request.meters,
    }));
  }
  if (value.provenance.provider === "codex")
    return (value as z.infer<typeof codex>).requests.map((request) => ({
      id: codexRequestIdentity(
        request.identity.threadId,
        request.identity.responseId
      ),
      meters: request.meters,
    }));
  return (value as z.infer<typeof gemini>).requests.map((request) => ({
    id: geminiRequestIdentity(request.identity.messageId),
    meters: request.meters,
  }));
}
export interface ImportAttributionContext {
  privatePolicy: unknown;
  /** All validated accepted/local records, including the complete causal control closure. */
  records: readonly PublicRecord[];
  policy: SharedPolicy;
}
/** Explicit import preparation preserves existing local decisions and never proposes a shared reinclude. */
export function normalizedImportOverrides(
  input: NormalizedImport,
  context: ImportAttributionContext
): PrivateAttributionPolicy["overrides"] {
  const value = parseNormalizedImport(input),
    policy = parseSharedPolicy(context.policy),
    privatePolicy = parsePrivateAttributionPolicy(context.privatePolicy);
  if (value.repositoryId !== policy.repositoryId)
    throw new ProtocolError("repository-mismatch");
  const records = context.records.map(parsePublicRecord);
  if (
    records.some(
      (record) =>
        record.repositoryId !== policy.repositoryId ||
        record.normalizationVersion !== policy.normalizationVersion
    )
  )
    throw new ProtocolError("repository-mismatch");
  const controls = resolveControls(
    new Map(records.map((record) => [recordHash(record), record]))
  );
  const overrides = [...privatePolicy.overrides];
  const source: SourceDescriptor = {
    provider: providerOf(value),
    instanceKey: "normalized-import",
    root: "normalized-import",
    sourceIdentity: "normalized-import",
    schema: NORMALIZED_IMPORT_SCHEMA,
    generation: "preparation",
    readerVersion: "1",
  };
  for (const observation of importedObservations(value, source)) {
    if (
      overrides.some(
        (choice) =>
          choice.provider === observation.provider &&
          choice.nativeUnitId === observation.nativeUnitId &&
          choice.representation === "request"
      )
    )
      continue;
    const unit = sanitizeObservation(observation, policy).unitKey;
    if (controls.excluded.has(unit) || controls.conflicting.has(unit)) continue;
    overrides.push({
      provider: observation.provider,
      nativeUnitId: observation.nativeUnitId,
      representation: "request",
      decision: "attribute",
    });
  }
  return parsePrivateAttributionPolicy({ ...privatePolicy, overrides })
    .overrides;
}
function importedObservations(
  value: NormalizedImport,
  source: SourceDescriptor
) {
  return requests(value).map((request) =>
    parseObservation({
      schemaVersion: 2,
      normalizationVersion: 1,
      provider: source.provider,
      representation: "request",
      identity: "provider-native",
      coverage: "native-request",
      nativeUnitId: request.id,
      nativeCoverageId: request.id,
      revision: { kind: "final" },
      supersedes: [],
      meters: request.meters,
      quality: "partial",
      execution: {
        cwd: null,
        repositoryId: value.repositoryId,
        remoteUrl: null,
      },
      source: {
        instanceKey: source.instanceKey,
        sourceIdentity: source.sourceIdentity,
        generation: source.generation,
        sourceSchema: source.schema,
        readerVersion: source.readerVersion,
      },
      lineage: { kind: "unknown", parentNativeId: null, inherited: "isolated" },
      diagnostics: [{ code: "incomplete-source", severity: "warning" }],
    })
  );
}
export interface NormalizedImportOptions {
  provider: ProviderId;
  /** Explicit, owner-selected local files only. Native projections are never implicitly wrapped. */
  paths: readonly string[];
  maxBytes?: number;
  /** Compose with this provider's existing discovery; keeps imported/native identity in one namespace. */
  nativeAdapter?: ProviderAdapter;
}
export function createNormalizedImportAdapter(
  options: NormalizedImportOptions
): ProviderAdapter {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (
    !["import", "codex", "gemini"].includes(options.provider) ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 16 * 1024 * 1024 ||
    options.paths.length > 1000 ||
    options.paths.some((path) => !isAbsolute(path))
  )
    throw new ProtocolError("invalid-record");
  const paths = new Set(options.paths.map((path) => resolve(path)));
  return {
    async discover(ctx) {
      const sources = options.nativeAdapter
        ? await options.nativeAdapter.discover(ctx)
        : [];
      for (const path of paths) {
        ctx.signal.throwIfAborted();
        let generation = "unavailable";
        try {
          if (!(await lstat(path)).isSymbolicLink())
            generation = (await sourceFileEpoch(path)).generation;
        } catch {
          /* Keep missing explicit sources visible. */
        }
        sources.push({
          provider: options.provider,
          instanceKey: dirname(path),
          root: path,
          sourceIdentity: path,
          schema: NORMALIZED_IMPORT_SCHEMA,
          readerVersion: "1",
          generation,
        });
      }
      return sources;
    },
    async *scan(input, checkpoint, signal, inputScope) {
      const source = parseProtocol(sourceDescriptorSchema, input),
        scope = parseProtocol(checkpointScopeSchema, inputScope);
      if (source.schema !== NORMALIZED_IMPORT_SCHEMA && options.nativeAdapter) {
        yield* options.nativeAdapter.scan(source, checkpoint, signal, scope);
        return;
      }
      const nextCheckpoint: Checkpoint = {
        schemaVersion: 1,
        provider: source.provider,
        instanceKey: source.instanceKey,
        sourceIdentity: source.sourceIdentity,
        sourceGeneration: source.generation,
        sourceSchema: source.schema,
        readerVersion: source.readerVersion,
        ...scope,
        continuation: null,
        cursor: {
          offset: 0,
          size: 0,
          prefixHash: emptyHash,
          incompleteTail: "",
        },
      };
      if (
        source.provider !== options.provider ||
        source.schema !== NORMALIZED_IMPORT_SCHEMA ||
        source.readerVersion !== "1" ||
        !paths.has(source.root) ||
        source.instanceKey !== dirname(source.root)
      ) {
        yield {
          source,
          observations: [],
          nextCheckpoint,
          outcome: "unsupported",
          diagnostics: [{ code: "unsupported-source", severity: "warning" }],
        };
        return;
      }
      let bytes: Buffer;
      try {
        signal.throwIfAborted();
        if ((await lstat(source.root)).isSymbolicLink())
          throw new Error("unavailable-source");
        const read = await readSourceFile(
          source.root,
          maxBytes,
          signal,
          source.generation
        );
        if (read.identity !== source.sourceIdentity)
          throw new Error("unavailable-source");
        if (read.bounded) {
          yield {
            source,
            observations: [],
            nextCheckpoint,
            outcome: "partial",
            diagnostics: [{ code: "incomplete-source", severity: "warning" }],
          };
          return;
        }
        bytes = read.bytes;
      } catch {
        yield {
          source,
          observations: [],
          nextCheckpoint,
          outcome: "unavailable",
          diagnostics: [
            {
              code: signal.aborted ? "timeout" : "unavailable-source",
              severity: "warning",
            },
          ],
        };
        return;
      }
      try {
        const value = parseNormalizedImport(JSON.parse(bytes.toString("utf8")));
        if (value.repositoryId !== scope.repositoryId)
          throw new ProtocolError("repository-mismatch");
        if (providerOf(value) !== source.provider)
          throw new ProtocolError("unsupported-source");
        const observations = importedObservations(value, source);
        nextCheckpoint.continuation = {
          provider: source.provider,
          readerVersion: "1",
          state: JSON.stringify({ provenance: value.provenance }),
        };
        yield {
          source,
          observations,
          nextCheckpoint,
          outcome: "partial",
          diagnostics: [{ code: "incomplete-source", severity: "warning" }],
        };
      } catch (error) {
        yield {
          source,
          observations: [],
          nextCheckpoint,
          outcome: "unsupported",
          diagnostics: [
            {
              code:
                error instanceof ProtocolError
                  ? error.diagnostic.code
                  : "invalid-record",
              severity: "warning",
            },
          ],
        };
      }
    },
  };
}
export const normalizedImportCapabilityManifest: CapabilityManifest =
  Object.freeze({
    provider: "import",
    normalizationVersion: 1,
    accounting: "fixture-certified",
    sourceSchemas: [NORMALIZED_IMPORT_SCHEMA],
    fixtureReferences: [
      "packages/core/src/providers/normalized-import.test.ts",
    ],
    identity: "provider-request",
    revision: "immutable-final",
    coverage: "request",
    forks: "stable-native-requests",
    modelSegmentation: "per-request",
  });
