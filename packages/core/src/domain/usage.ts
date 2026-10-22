import { z } from "zod";
import { diagnosticSchema, digestSchema, modelIdSchema, parseProtocol, parsePublicProtocol, privateStringSchema,
  providerIdSchema, repositoryIdSchema, safeCounterSchema, vendorIdSchema } from "./capabilities.js";

const dimension = safeCounterSchema.nullable();
/**
 * input/output/total retain the provider's reported dimensions. With
 * includes-cached, input = uncachedInput + cachedInput when all are known;
 * with excludes-cached, input = uncachedInput. Cache creation can be a subset
 * of input or a separate category. Reasoning may likewise overlap output.
 * Never obtain volume by adding every dimension; price these against exact
 * model/rate-card rules. Null is unknown or unreported; measured zero is 0.
 */
export const meterSegmentSchema = z.object({ vendor: vendorIdSchema.nullable(), model: modelIdSchema.nullable(),
  total: dimension, input: dimension, uncachedInput: dimension, cachedInput: dimension,
  cacheCreation: z.object({ fiveMinutes: dimension, oneHour: dimension, other: dimension }).strict(),
  output: dimension, reasoningOutput: dimension,
  semantics: z.object({ input: z.enum(["includes-cached", "excludes-cached", "unknown"]),
    output: z.enum(["includes-reasoning", "excludes-reasoning", "unknown"]),
    cacheCreation: z.enum(["included-in-input", "separate", "unknown"]),
    total: z.enum(["input-plus-output", "provider-defined", "unknown"]) }).strict()
}).strict().superRefine((meter, ctx) => {
  const invalid = () => ctx.addIssue({ code: "custom", message: "invalid-meter" });
  if (meter.model === "gpt-5.4-mini" && meter.vendor !== "openai") invalid();
  if (meter.semantics.input === "includes-cached" && meter.input !== null) {
    if (meter.cachedInput !== null && meter.cachedInput > meter.input) invalid();
    if (meter.uncachedInput !== null && meter.uncachedInput > meter.input) invalid();
    if (meter.cachedInput !== null && meter.uncachedInput !== null &&
      meter.cachedInput + meter.uncachedInput !== meter.input) invalid();
  }
  if (meter.semantics.input === "excludes-cached" && meter.input !== null &&
    meter.uncachedInput !== null && meter.input !== meter.uncachedInput) invalid();
  if (meter.semantics.output === "includes-reasoning" && meter.output !== null &&
    meter.reasoningOutput !== null && meter.reasoningOutput > meter.output) invalid();
  if (meter.semantics.total === "input-plus-output" && meter.input !== null && meter.output !== null &&
    meter.total !== null && (!Number.isSafeInteger(meter.input + meter.output) || meter.total !== meter.input + meter.output)) invalid();
  const creation = Object.values(meter.cacheCreation).filter((value): value is number => value !== null);
  const creationSum = creation.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(creationSum)) invalid();
  if (meter.semantics.cacheCreation === "included-in-input" && meter.input !== null && creationSum > meter.input) invalid();
});
export type MeterSegment = z.infer<typeof meterSegmentSchema>;

/** A certified envelope carries evidence; only the provider contract can certify its order. */
export const publicRevisionSchema = z.union([z.literal("final"), z.string().regex(/^unordered:[a-f0-9]{64}$/),
  z.string().regex(/^certified:[a-f0-9]{64}:(?:0|[1-9][0-9]{0,15})$/).refine((revision) =>
    Number.isSafeInteger(Number(revision.split(":")[2])))]);
const publicFields = { schemaVersion: z.literal(2), repositoryId: repositoryIdSchema,
  normalizationVersion: z.literal(1), unitKey: digestSchema, coverageKey: digestSchema,
  provider: providerIdSchema, representation: z.enum(["request", "cumulative"]),
  revision: publicRevisionSchema,
  supersedes: z.array(digestSchema).max(10_000), meters: z.array(meterSegmentSchema).min(1).max(1024),
  quality: z.enum(["exact", "partial"]) };
export const publicObservationSchema = z.object(publicFields).strict().refine((observation) =>
  observation.representation === "request" ? observation.revision === "final" : observation.revision !== "final");
export type PublicObservation = z.infer<typeof publicObservationSchema>;

export const usageObservationSchema = z.object({ schemaVersion: z.literal(2), normalizationVersion: z.literal(1),
  provider: providerIdSchema, representation: z.enum(["request", "cumulative"]),
  identity: z.enum(["provider-native", "local-fallback"]), coverage: z.enum(["native-request", "origin-stream"]),
  nativeUnitId: privateStringSchema,
  nativeCoverageId: privateStringSchema,
  revision: z.discriminatedUnion("kind", [z.object({ kind: z.literal("final") }).strict(),
    z.object({ kind: z.literal("unordered"), evidence: privateStringSchema }).strict(),
    z.object({ kind: z.literal("certified"), evidence: privateStringSchema, sequence: safeCounterSchema }).strict()]),
  supersedes: z.array(digestSchema).max(10_000), meters: z.array(meterSegmentSchema).min(1).max(1024),
  quality: z.enum(["exact", "partial"]),
  execution: z.object({ cwd: privateStringSchema.nullable(), repositoryId: repositoryIdSchema.nullable(),
    remoteUrl: privateStringSchema.nullable() }).strict(),
  source: z.object({ instanceKey: privateStringSchema, sourceIdentity: privateStringSchema,
    generation: privateStringSchema, sourceSchema: privateStringSchema, readerVersion: privateStringSchema }).strict(),
  lineage: z.object({ kind: z.enum(["root", "child", "fork", "unknown"]),
    parentNativeId: privateStringSchema.nullable(), inherited: z.enum(["none", "isolated", "uncertain"]) }).strict(),
  diagnostics: z.array(diagnosticSchema).max(1024)
}).strict().refine((observation) => observation.representation === "request"
  ? observation.revision.kind === "final" : observation.revision.kind !== "final" && observation.coverage === "origin-stream");
export type UsageObservation = z.infer<typeof usageObservationSchema>;
export function parseObservation(input: unknown): UsageObservation {
  return parseProtocol(usageObservationSchema, input);
}
export function parsePublicObservation(input: unknown): PublicObservation {
  return parsePublicProtocol(publicObservationSchema, input);
}
