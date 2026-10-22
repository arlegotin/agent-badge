import { z } from "zod";
import type { UsageObservation, PublicObservation } from "./usage.js";

export const providerIdSchema = z.enum(["codex", "claude", "gemini", "opencode", "cursor", "copilot", "import"]);
export type ProviderId = z.infer<typeof providerIdSchema>;
export const vendorIdSchema = z.enum(["openai", "anthropic", "google", "local"]);
// Exact identity registry, independent of rates. Expand only with primary-source evidence.
// Official model pages and dated price sources are recorded in pricing/catalog.ts.
export const modelIdSchema = z.enum(["gpt-5.4-mini", "gpt-4.1-mini", "claude-sonnet-4-6"]);
export const safeCounterSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const repositoryIdSchema = z.uuid().regex(/^[a-f0-9-]{36}$/);
export const privateStringSchema = z.string().min(1).max(4096);
export const PUBLIC_OBJECT_MAX_BYTES = 256 * 1024;
export const diagnosticCodeSchema = z.enum(["invalid-record", "object-too-large", "envelope-too-large",
  "too-many-objects", "invalid-path", "invalid-object-type", "unsupported-contract", "unsupported-source",
  "unavailable-source", "incomplete-source", "unknown-model", "uncertain-lineage", "repository-mismatch",
  "unsupported-identity", "overflow", "timeout"]);
export const diagnosticSchema = z.object({ code: diagnosticCodeSchema,
  severity: z.enum(["info", "warning", "error"]) }).strict();
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export type DiagnosticCode = Diagnostic["code"];

/** Safe to show verbatim: neither untrusted values nor Zod issue paths survive. */
export class ProtocolError extends Error {
  readonly diagnostic: Diagnostic;
  constructor(code: DiagnosticCode) {
    super(code);
    this.name = "ProtocolError";
    this.diagnostic = { code, severity: "error" };
  }
}

export function parseProtocol<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    const result = schema.safeParse(input);
    if (result.success) return result.data;
  } catch {
    // Even malformed objects with throwing accessors cannot echo private input.
  }
  throw new ProtocolError("invalid-record");
}

/** Apply the outbound byte cap after structural validation has removed raw input. */
export function parsePublicProtocol<T>(schema: z.ZodType<T>, input: unknown): T {
  const record = parseProtocol(schema, input);
  if (Buffer.byteLength(JSON.stringify(record), "utf8") > PUBLIC_OBJECT_MAX_BYTES)
    throw new ProtocolError("object-too-large");
  return record;
}

export const sourceDescriptorSchema = z.object({ provider: providerIdSchema, instanceKey: privateStringSchema,
  root: privateStringSchema, schema: privateStringSchema, generation: privateStringSchema,
  readerVersion: privateStringSchema, sourceIdentity: privateStringSchema }).strict();
export type SourceDescriptor = z.infer<typeof sourceDescriptorSchema>;
export const checkpointSchema = z.object({ schemaVersion: z.literal(1), provider: providerIdSchema,
  instanceKey: privateStringSchema, sourceIdentity: privateStringSchema, sourceGeneration: privateStringSchema,
  sourceSchema: privateStringSchema, readerVersion: privateStringSchema, normalizationVersion: z.literal(1),
  repositoryId: repositoryIdSchema, attributionPolicyHash: digestSchema,
  cursor: z.object({ offset: safeCounterSchema, prefixHash: digestSchema, size: safeCounterSchema,
    incompleteTail: z.string().max(256 * 1024) }).strict().refine((cursor) => cursor.offset <= cursor.size)
}).strict();
export type Checkpoint = z.infer<typeof checkpointSchema>;
export const scanOutcomeSchema = z.enum(["complete", "partial", "unavailable", "unsupported"]);
export type ScanOutcome = z.infer<typeof scanOutcomeSchema>;
export interface ScanBatch {
  observations: UsageObservation[];
  nextCheckpoint: Checkpoint;
  outcome: ScanOutcome;
  diagnostics: Diagnostic[];
}
export const discoveryContextSchema = z.object({ repositoryId: repositoryIdSchema,
  enrolledRoots: z.array(privateStringSchema), signal: z.custom<AbortSignal>((input) => input instanceof AbortSignal)
}).strict();
export type DiscoveryContext = z.infer<typeof discoveryContextSchema>;
export interface ProviderAdapter {
  discover(ctx: DiscoveryContext): Promise<SourceDescriptor[]>;
  scan(source: SourceDescriptor, checkpoint: Checkpoint | null, signal: AbortSignal): AsyncIterable<ScanBatch>;
}

export const capabilityManifestSchema = z.object({ provider: providerIdSchema, normalizationVersion: z.literal(1),
  accounting: z.enum(["fixture-certified", "unsupported"]), sourceSchemas: z.array(privateStringSchema),
  fixtureReferences: z.array(privateStringSchema), identity: z.enum(["provider-request", "certified-stream", "unsupported"]),
  revision: z.enum(["immutable-final", "provider-certified", "unordered"]),
  coverage: z.enum(["request", "cumulative", "unsupported"]),
  forks: z.enum(["stable-native-requests", "certified-inheritance", "unsupported"]),
  modelSegmentation: z.enum(["per-request", "per-segment", "unknown"])
}).strict().refine((manifest) => manifest.accounting !== "fixture-certified" ||
  (manifest.sourceSchemas.length > 0 && manifest.fixtureReferences.length > 0 && manifest.identity !== "unsupported"));
export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;
export type RevisionComparison = "equal" | "before" | "after" | "incomparable";
export interface AccountingContract {
  readonly provider: ProviderId;
  readonly normalizationVersion: 1;
  readonly requestIdentity: "provider-wide-native-request";
  readonly requestRevision: "immutable-final";
  readonly cumulativeRevision: "uncertified" | "provider-certified";
  readonly requestCoverage: "native-request" | "origin-stream";
  readonly cumulativeCoverage: "native-stream";
  compareRevision(a: PublicObservation, b: PublicObservation): RevisionComparison;
}
export interface AccountingRegistry {
  getAccountingContract(provider: string, normalizationVersion: number): AccountingContract;
}
