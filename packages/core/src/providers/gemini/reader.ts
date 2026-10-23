import { z } from "zod";
import {
  knownModelVendors,
  modelIdSchema,
  safeCounterSchema,
} from "../../domain/capabilities.js";
import type {
  Diagnostic,
  SourceDescriptor,
} from "../../domain/capabilities.js";
import { parseObservation } from "../../domain/usage.js";
import type { MeterSegment, UsageObservation } from "../../domain/usage.js";
import { geminiRequestIdentity } from "./identity.js";
export const GEMINI_READER_VERSION = "1";
export const GEMINI_JSONL_SCHEMA = "gemini-saved-jsonl-pin-09d81bf";
export const GEMINI_JSON_SCHEMA = "gemini-saved-json-pin-09d81bf";
export const geminiContinuationSchema = z
  .object({
    version: z.literal(1),
    physicalEpoch: z.string().regex(/^[a-f0-9]{64}$/),
    projectHash: z.string().regex(/^[a-f0-9]{64}$/),
    metadataValid: z.boolean(),
  })
  .strict();
export type GeminiContinuation = z.infer<typeof geminiContinuationSchema>;
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
const text = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= 1024 ? v : null;
/** Native values are saved-success counters; absent optional dimensions remain unknown. */
function meter(row: Obj): MeterSegment | null {
  const tokens = object(row.tokens);
  if (!tokens) return null;
  for (const name of ["input", "output", "cached", "total", "thoughts", "tool"])
    if (
      tokens[name] !== undefined &&
      !safeCounterSchema.safeParse(tokens[name]).success
    )
      return null;
  const { input, output, cached, total } = tokens;
  if (
    typeof input !== "number" ||
    typeof output !== "number" ||
    typeof cached !== "number" ||
    typeof total !== "number" ||
    cached > input
  )
    return null;
  const thoughts = typeof tokens.thoughts === "number" ? tokens.thoughts : null,
    tool = typeof tokens.tool === "number" ? tokens.tool : null;
  const knownSum = input + output + (thoughts ?? 0) + (tool ?? 0);
  if (
    !Number.isSafeInteger(knownSum) ||
    total < knownSum ||
    (thoughts !== null && tool !== null && total !== knownSum)
  )
    return null;
  const modelResult = modelIdSchema.safeParse(row.model),
    model =
      modelResult.success && knownModelVendors[modelResult.data] === "google"
        ? modelResult.data
        : null;
  return {
    vendor: model ? "google" : null,
    model,
    total,
    input,
    uncachedInput: input - cached,
    cachedInput: cached,
    cacheCreation: { fiveMinutes: null, oneHour: null, other: null },
    output,
    reasoningOutput: thoughts,
    toolInput: tool,
    semantics: {
      input: "includes-cached",
      output: "excludes-reasoning",
      cacheCreation: "unknown",
      total: "provider-defined",
      toolInput: "separate",
    },
  };
}
/** Rewinds and patches alter conversation state, never already incurred receipts. */
export function parseGeminiSession(
  bytes: Buffer,
  source: SourceDescriptor,
  cwd: string,
  projectHash: string,
  continuation?: GeminiContinuation
) {
  const observations: UsageObservation[] = [],
    diagnostics: Diagnostic[] = [];
  let offset = 0,
    metadataValid = continuation?.metadataValid ?? false;
  const add = (code: Diagnostic["code"]) => {
    if (!diagnostics.some((d) => d.code === code))
      diagnostics.push({ code, severity: "warning" });
  };
  add("incomplete-source"); // Successful recorded history cannot certify failed attempts or upstream completeness.
  const visit = (value: unknown, historyMessage = false): void => {
    const row = object(value);
    if (!row) {
      add("invalid-record");
      return;
    }
    // History checkpoints contain messages, never another session/checkpoint.
    // A message cannot mutate the provenance established by its metadata row.
    const metadataFields = [
      "sessionId",
      "projectHash",
      "messages",
      "$set",
      "$patch",
      "$rewindTo",
    ];
    if (
      (historyMessage || Object.hasOwn(row, "type")) &&
      metadataFields.some((key) => Object.hasOwn(row, key))
    ) {
      add("unsupported-source");
      return;
    }
    if (Object.hasOwn(row, "sessionId") || Object.hasOwn(row, "projectHash")) {
      metadataValid = !!text(row.sessionId) && row.projectHash === projectHash;
      if (!metadataValid) add("repository-mismatch");
    }
    if (Array.isArray(row.messages)) {
      if (row.messages.length > 1000) {
        add("unsupported-source");
        return;
      }
      for (const message of row.messages) visit(message, true);
      return;
    }
    if (Object.hasOwn(row, "$set")) {
      const update = object(row.$set);
      if (!update) {
        add("invalid-record");
        return;
      }
      if (
        Object.hasOwn(update, "projectHash") &&
        update.projectHash !== projectHash
      ) {
        metadataValid = false;
        add("repository-mismatch");
      }
      if (Array.isArray(update.messages)) {
        if (update.messages.length > 1000) {
          add("unsupported-source");
          return;
        }
        for (const message of update.messages) visit(message, true);
      }
      return;
    }
    if (Object.hasOwn(row, "$patch")) {
      const patch = object(row.$patch);
      if (
        !patch ||
        Object.keys(patch).some(
          (k) =>
            ![
              "id",
              "content",
              "toolCalls",
              "updates",
              "removeIds",
              "orderIds",
            ].includes(k)
        )
      )
        add("unsupported-source");
      return;
    }
    if (Object.hasOwn(row, "$rewindTo")) return;
    if (row.type !== "gemini") {
      if (
        !["user", "info", "error", "warning"].includes(String(row.type)) &&
        !Object.hasOwn(row, "sessionId")
      )
        add("unsupported-source");
      return;
    }
    if (!metadataValid) {
      add("repository-mismatch");
      return;
    }
    const id = text(row.id);
    if (!id) {
      add("unsupported-identity");
      return;
    }
    // A pending row can legitimately gain usage later under the SAME durable ID.
    if (row.tokens === null || row.tokens === undefined) {
      add("incomplete-source");
      return;
    }
    const amount = meter(row);
    if (!amount) {
      add("invalid-record");
      return;
    }
    // Writer uses upstreamCounter ?? 0. An all-zero object is indistinguishable
    // from wholly missing upstream usage and must never certify a zero badge.
    if (amount.total === 0) {
      add("incomplete-source");
      return;
    }
    if (!amount.model) add("unknown-model");
    observations.push(
      parseObservation({
        schemaVersion: 2,
        normalizationVersion: 1,
        provider: "gemini",
        representation: "request",
        identity: "provider-native",
        coverage: "native-request",
        nativeUnitId: geminiRequestIdentity(id),
        nativeCoverageId: geminiRequestIdentity(id),
        revision: { kind: "final" },
        supersedes: [],
        meters: [amount],
        quality: "partial",
        execution: { cwd, repositoryId: null, remoteUrl: null },
        source: {
          instanceKey: source.instanceKey,
          sourceIdentity: source.sourceIdentity,
          generation: source.generation,
          sourceSchema: source.schema,
          readerVersion: source.readerVersion,
        },
        lineage: { kind: "unknown", parentNativeId: null, inherited: "none" },
        diagnostics: [{ code: "incomplete-source", severity: "warning" }],
      })
    );
  };
  if (source.schema === GEMINI_JSON_SCHEMA) {
    try {
      visit(JSON.parse(bytes.toString("utf8")));
      offset = bytes.length;
    } catch {
      add("invalid-record");
    }
  } else
    for (
      let end = bytes.indexOf(10, offset);
      end !== -1 && observations.length < 1000;
      end = bytes.indexOf(10, offset)
    ) {
      const line = bytes.subarray(offset, end);
      if (!line.length) {
        offset = end + 1;
        continue;
      }
      if (line.length > 256 * 1024) {
        offset = end + 1;
        add("incomplete-source");
        continue;
      }
      let record: unknown;
      try {
        record = JSON.parse(line.toString("utf8"));
      } catch {
        offset = end + 1;
        add("invalid-record");
        continue;
      }
      const parsed = object(record),
        update = object(parsed?.$set),
        history = parsed?.messages ?? update?.messages;
      // A checkpoint line is atomic: replay it next time if it cannot fit this
      // batch, instead of advancing over unconsumed message receipts.
      if (
        Array.isArray(history) &&
        observations.length > 0 &&
        history.length > 1000 - observations.length
      )
        break;
      offset = end + 1;
      try {
        visit(record);
      } catch {
        add("invalid-record");
      }
    }
  return {
    observations,
    diagnostics,
    offset,
    state: {
      version: 1 as const,
      physicalEpoch: source.generation,
      projectHash,
      metadataValid,
    },
  };
}
