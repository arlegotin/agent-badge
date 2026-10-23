import { z } from "zod";
import { digestSchema, parseProtocol, parsePublicProtocol, ProtocolError, PUBLIC_OBJECT_MAX_BYTES, repositoryIdSchema, safeCounterSchema } from "./capabilities.js";
import { sharedPolicySchema } from "./policy.js";
import { publicObservationSchema } from "./usage.js";

export { PUBLIC_OBJECT_MAX_BYTES } from "./capabilities.js";
export const ENVELOPE_MAX_BYTES = 10 * 1024 * 1024;
export const ENVELOPE_MAX_OBJECTS = 10_000;
const controlFields = { schemaVersion: z.literal(2), normalizationVersion: z.literal(1),
  repositoryId: repositoryIdSchema, targetUnitKey: digestSchema, supersedes: z.array(digestSchema).max(10_000) };
export const controlRecordSchema = z.discriminatedUnion("kind", [
  z.object({ ...controlFields, kind: z.literal("exclude") }).strict(),
  z.object({ ...controlFields, kind: z.literal("include") }).strict(),
  z.object({ ...controlFields, kind: z.literal("correct"),
    replacedObservationHashes: z.array(digestSchema).min(1).max(10_000),
    replacementObservationHashes: z.array(digestSchema).min(1).max(10_000) }).strict()
]);
export type ControlRecord = z.infer<typeof controlRecordSchema>;
export const publicRecordSchema = z.union([publicObservationSchema, controlRecordSchema]);
export type PublicRecord = z.infer<typeof publicRecordSchema>;
export function parsePublicRecord(input: unknown): PublicRecord {
  return parsePublicProtocol(publicRecordSchema, input);
}
export const ledgerMetaSchema = z.object({ schemaVersion: z.literal(2), protocolVersion: z.literal(1),
  repositoryId: repositoryIdSchema, normalizationVersion: z.literal(1),
  catalogVersion: safeCounterSchema.refine((version) => version > 0), catalogHash: digestSchema,
  presentationVersion: z.literal(2).optional(), policy: sharedPolicySchema }).strict().refine((meta) => meta.repositoryId === meta.policy.repositoryId &&
    meta.normalizationVersion === meta.policy.normalizationVersion &&
    (meta.policy.badge.color === undefined || meta.presentationVersion === 2));
export type LedgerMeta = z.infer<typeof ledgerMetaSchema>;
export function parseLedgerMeta(input: unknown): LedgerMeta { return parseProtocol(ledgerMetaSchema, input); }

/** Validate tree entries before reading/parsing; transport must not follow symlinks. */
export function validatePublicBlob(path: string, mode: string, bytes: Uint8Array, objectType: string): void {
  if (mode !== "100644" || objectType !== "blob") throw new ProtocolError("invalid-object-type");
  const fixed = ["meta.json", "catalog.json", "summary.json", "badge.svg", "README.md"];
  const match = /^(?:observations|controls)\/([a-f0-9]{2})\/([a-f0-9]{64})\.json$/.exec(path);
  if (!fixed.includes(path) && !(match && match[1] === match[2].slice(0, 2))) throw new ProtocolError("invalid-path");
  if (bytes.byteLength > PUBLIC_OBJECT_MAX_BYTES) throw new ProtocolError("object-too-large");
}
export function validateEnvelope(byteLength: number, objectCount: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || !Number.isSafeInteger(objectCount) || objectCount < 0)
    throw new ProtocolError("invalid-record");
  if (byteLength > ENVELOPE_MAX_BYTES) throw new ProtocolError("envelope-too-large");
  if (objectCount > ENVELOPE_MAX_OBJECTS) throw new ProtocolError("too-many-objects");
}
