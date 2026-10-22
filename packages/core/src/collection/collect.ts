import { isDeepStrictEqual } from "node:util";
import { ProtocolError } from "../domain/capabilities.js";
import type {
  CheckpointScope,
  Diagnostic,
  ScanBatch,
  SourceDescriptor,
} from "../domain/capabilities.js";
import { parseSharedPolicy } from "../domain/policy.js";
import type { SharedPolicy } from "../domain/policy.js";
import type { PublicRecord, ControlRecord } from "../domain/ledger.js";
import type { UsageObservation, PublicObservation } from "../domain/usage.js";
import { canonicalRemoteUrl } from "../git/remote-binding.js";
import type { RepositoryContext } from "../git/context.js";
import type { LocalStore, JournalEntry } from "../storage/store.js";
import { recordHash } from "../ledger/canonical-json.js";
import { sanitizeObservation } from "../ledger/sanitize.js";
import { codexAdapter } from "../providers/codex/adapter.js";
import { claudeAdapter } from "../providers/claude/adapter.js";
import {
  attributeObservation,
  attributionPolicyHash,
  containsPath,
  parsePrivateAttributionPolicy,
} from "./attribution.js";
import type { PrivateAttributionPolicy } from "./attribution.js";
import {
  ATTRIBUTION_METADATA_MAX_BYTES,
  observationEvidenceHash,
} from "./metadata.js";
import type { AttributionDecision, AttributionMetadata } from "./metadata.js";
import {
  discoverSources,
  resolveAttributionEvidence,
} from "./source-resolver.js";
import type {
  ProviderAdapters,
  ProviderRoots,
  SourceOutcome,
  SourceTarget,
} from "./source-resolver.js";

export interface CollectOptions {
  repository: RepositoryContext;
  store: LocalStore;
  policy: SharedPolicy;
  signal: AbortSignal;
  /** Strict private activation configuration, persisted/restored by the caller. */
  privatePolicy?: unknown;
  adapters?: ProviderAdapters;
  roots?: ProviderRoots;
  target?: SourceTarget;
}
export interface CollectionResult {
  queuedHashes: string[];
  sourceOutcomes: SourceOutcome[];
  diagnostics: Diagnostic[];
  cancelled: boolean;
}
const identity = (source: SourceDescriptor) =>
  JSON.stringify([source.provider, source.instanceKey, source.sourceIdentity]);
type Prior = { decision: AttributionDecision; metadata: AttributionMetadata };
function priorDecisions(entries: readonly JournalEntry[]): Map<string, Prior> {
  const result = new Map<string, Prior>();
  for (const entry of entries)
    if (entry.attribution)
      for (const decision of entry.attribution.decisions) {
        const established = result.get(decision.observationHash)?.decision
          .verifiedCommonDir;
        result.set(decision.observationHash, {
          decision: {
            ...decision,
            verifiedCommonDir:
              decision.verifiedCommonDir ?? established ?? null,
          },
          metadata: entry.attribution,
        });
      }
  return result;
}
function relevantPolicyChanged(
  observation: UsageObservation,
  prior: AttributionMetadata,
  policy: PrivateAttributionPolicy
): boolean {
  const overrides = (values: PrivateAttributionPolicy["overrides"]) =>
    values.filter(
      (value) =>
        value.provider === observation.provider &&
        value.nativeUnitId === observation.nativeUnitId &&
        value.representation === observation.representation
    );
  const mappings = (values: PrivateAttributionPolicy["mappings"]) =>
    values.filter(
      (value) =>
        observation.execution.cwd !== null &&
        containsPath(value.cwd, observation.execution.cwd)
    );
  const remote =
    observation.execution.remoteUrl === null
      ? null
      : canonicalRemoteUrl(observation.execution.remoteUrl);
  const oldAliases = prior.policy.remoteAliases.map((alias) =>
      canonicalRemoteUrl(alias)
    ),
    newAliases = policy.remoteAliases.map((alias) => canonicalRemoteUrl(alias));
  const aliasChanged =
    remote !== null &&
    (prior.decisions.find(
      (value) => value.observationHash === observationEvidenceHash(observation)
    )?.reason === "remote-alias"
      ? oldAliases.includes(remote) !== newAliases.includes(remote)
      : (oldAliases.length === 0 || oldAliases.includes(remote)) !==
        (newAliases.length === 0 || newAliases.includes(remote)));
  return (
    !isDeepStrictEqual(
      overrides(prior.policy.overrides),
      overrides(policy.overrides)
    ) ||
    !isDeepStrictEqual(
      mappings(prior.policy.mappings),
      mappings(policy.mappings)
    ) ||
    aliasChanged
  );
}
async function project(
  observations: UsageObservation[],
  entries: JournalEntry[],
  options: CollectOptions,
  policy: SharedPolicy,
  privatePolicy: PrivateAttributionPolicy,
  scope: CheckpointScope,
  historical = false
): Promise<{
  records: PublicRecord[];
  metadata: AttributionMetadata;
  metadataChanged: boolean;
}> {
  const prior = priorDecisions(entries),
    known = new Map(
      entries
        .flatMap((entry) => entry.records)
        .map((record) => [recordHash(record), record])
    );
  const records: PublicRecord[] = [],
    decisions: AttributionDecision[] = [];
  const add = (record: PublicRecord) => {
    const hash = recordHash(record);
    if (!known.has(hash)) {
      known.set(hash, record);
      records.push(record);
    }
  };
  // Coalesce copied evidence for a single unit. Any unresolved contradictory copy stays uncounted.
  const units = new Map<
    string,
    {
      observation: UsageObservation;
      decision: AttributionDecision;
      previous?: Prior;
    }[]
  >();
  for (const observation of new Map(
    observations.map((value) => [observationEvidenceHash(value), value])
  ).values()) {
    options.signal.throwIfAborted();
    const hash = observationEvidenceHash(observation),
      previous = prior.get(hash);
    let decision: AttributionDecision;
    if (
      previous &&
      !relevantPolicyChanged(observation, previous.metadata, privatePolicy) &&
      !(
        previous.decision.status === "ambiguous" &&
        previous.metadata.policyHash !== scope.attributionPolicyHash
      )
    )
      decision = previous.decision;
    else {
      const evidence =
        historical && !previous
          ? {
              cwd: "unavailable" as const,
              commonDir: null,
              targetCommonDir: options.repository.commonDir,
              nested: false,
              remoteUrl: null,
              historicalMembership:
                observation.execution.cwd !== null &&
                privatePolicy.verifiedWorktrees.some(
                  (value) =>
                    value.commonDir === options.repository.commonDir &&
                    containsPath(value.path, observation.execution.cwd!)
                ),
            }
          : await resolveAttributionEvidence(
              observation,
              options.repository,
              privatePolicy
            );
      // Only the exact historical observation can reuse its own verified membership after loss of a path.
      if (
        previous?.decision.verifiedCommonDir === options.repository.commonDir &&
        evidence.cwd !== "resolved"
      )
        evidence.historicalMembership = true;
      const result = attributeObservation(observation, {
        repositoryId: policy.repositoryId,
        privatePolicy,
        evidence,
      });
      decision = {
        observationHash: hash,
        ...result,
        verifiedCommonDir:
          result.reason === "git-membership" ||
          result.reason === "historical-membership"
            ? options.repository.commonDir
            : previous?.decision.verifiedCommonDir ?? null,
      };
    }
    decisions.push(decision);
    const key = JSON.stringify([
      observation.provider,
      observation.representation,
      observation.nativeUnitId,
    ]);
    const values = units.get(key) ?? [];
    values.push({ observation, decision, previous });
    units.set(key, values);
  }
  for (const values of units.values()) {
    const { observation } = values[0];
    let publicObservation: PublicObservation;
    try {
      // Explicit attribution establishes the target namespace; sanitizer still enforces every public field.
      publicObservation = sanitizeObservation(
        {
          ...observation,
          execution: {
            ...observation.execution,
            repositoryId: policy.repositoryId,
          },
        },
        policy
      );
    } catch (error) {
      if (error instanceof ProtocolError) continue;
      throw error;
    }
    const unit = publicObservation.unitKey;
    const oldObservations = [...known.values()].filter(
      (record): record is PublicObservation =>
        !("kind" in record) && record.unitKey === unit
    );
    const controls = [...known.entries()].filter(
      (entry): entry is [string, ControlRecord] =>
        "kind" in entry[1] && entry[1].targetUnitKey === unit
    );
    const superseded = new Set(
      controls.flatMap(([, record]) => record.supersedes)
    );
    const heads = controls.filter(([hash]) => !superseded.has(hash));
    const included = values.every(
      (value) => value.decision.status === "included"
    );
    const explicitChange = values.some(
      (value) =>
        value.previous &&
        relevantPolicyChanged(
          value.observation,
          value.previous.metadata,
          privatePolicy
        )
    );
    const explicitExclusion = values.some(
      (value) =>
        value.decision.status === "excluded" &&
        value.decision.reason === "user-override"
    );
    if (included) {
      for (const value of values)
        try {
          add(
            sanitizeObservation(
              {
                ...value.observation,
                execution: {
                  ...value.observation.execution,
                  repositoryId: policy.repositoryId,
                },
              },
              policy
            )
          );
        } catch (error) {
          if (!(error instanceof ProtocolError)) throw error;
        }
      if (heads.some(([, control]) => control.kind === "exclude"))
        add({
          schemaVersion: 2,
          normalizationVersion: 1,
          repositoryId: policy.repositoryId,
          kind: "include",
          targetUnitKey: unit,
          supersedes: heads.map(([hash]) => hash).sort(),
        });
    } else if (
      oldObservations.length &&
      (explicitChange || explicitExclusion) &&
      (heads.length === 0 ||
        heads.some(([, control]) => control.kind !== "exclude"))
    ) {
      add({
        schemaVersion: 2,
        normalizationVersion: 1,
        repositoryId: policy.repositoryId,
        kind: "exclude",
        targetUnitKey: unit,
        supersedes: heads.map(([hash]) => hash).sort(),
      });
    }
  }
  const { verifiedWorktrees: _, ...snapshot } = privatePolicy;
  return {
    records,
    metadataChanged: decisions.some(
      (decision) =>
        prior.get(decision.observationHash)?.metadata.policyHash !==
        scope.attributionPolicyHash
    ),
    metadata: {
      schemaVersion: 1,
      policyHash: scope.attributionPolicyHash,
      policy: snapshot,
      decisions,
    },
  };
}

/** Partition persistence independently of unit reduction, including a single unit's long history. */
function boundedChunks<T>(
  values: readonly T[],
  baseBytes: number,
  maxBytes: number
): T[][] {
  if (baseBytes > maxBytes) throw new ProtocolError("object-too-large");
  const chunks: T[][] = [[]];
  let bytes = baseBytes;
  for (const value of values) {
    const valueBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    if (baseBytes + valueBytes > maxBytes)
      throw new ProtocolError("object-too-large");
    let chunk = chunks[chunks.length - 1];
    if (
      chunk.length === 10000 ||
      bytes + valueBytes + (chunk.length ? 1 : 0) > maxBytes
    ) {
      chunk = [];
      chunks.push(chunk);
      bytes = baseBytes;
    }
    bytes += valueBytes + (chunk.length ? 1 : 0);
    chunk.push(value);
  }
  return chunks;
}
function projectionChunks(projection: {
  records: PublicRecord[];
  metadata: AttributionMetadata;
}) {
  const empty = { ...projection.metadata, decisions: [] };
  const decisions = boundedChunks(
    projection.metadata.decisions,
    Buffer.byteLength(JSON.stringify(empty), "utf8"),
    ATTRIBUTION_METADATA_MAX_BYTES
  );
  // Keep records comfortably below the journal's complete 32 MiB envelope bound as well.
  const records = boundedChunks(projection.records, 2, 4 * 1024 * 1024);
  return Array.from(
    { length: Math.max(decisions.length, records.length) },
    (_, index) => ({
      metadata: { ...empty, decisions: decisions[index] ?? [] },
      records: records[index] ?? [],
    })
  );
}

/** Local-only collection. Each source transaction owns candidate retrieval through durable batch commit. */
export async function collectUsage(
  options: CollectOptions
): Promise<CollectionResult> {
  const policy = parseSharedPolicy(options.policy),
    privatePolicy = parsePrivateAttributionPolicy(options.privatePolicy ?? {});
  const scope: CheckpointScope = {
    repositoryId: policy.repositoryId,
    normalizationVersion: policy.normalizationVersion,
    attributionPolicyHash: attributionPolicyHash(policy, privatePolicy),
  };
  const result: CollectionResult = {
    queuedHashes: [],
    sourceOutcomes: [],
    diagnostics: [],
    cancelled: options.signal.aborted,
  };
  const failure = () => {
    result.diagnostics.push({
      code: options.signal.aborted ? "timeout" : "incomplete-source",
      severity: "warning",
    });
  };
  if (!options.signal.aborted)
    try {
      await options.store.withLock(options.signal, async () => {
        let entries = await options.store.journal();
        const groups = new Map<string, JournalEntry[]>();
        for (const entry of entries) {
          const key = identity(entry.source),
            group = groups.get(key) ?? [];
          group.push(entry);
          groups.set(key, group);
        }
        for (const group of groups.values()) {
          options.signal.throwIfAborted();
          try {
            const latest = group.findLast(
              (entry) =>
                entry.outcome !== "unavailable" &&
                entry.outcome !== "unsupported"
            );
            if (!latest) continue;
            const observations = [
              ...new Map(
                group
                  .flatMap((entry) => entry.observations)
                  .map((observation) => [
                    observationEvidenceHash(observation),
                    observation,
                  ])
              ).values(),
            ];
            if (!observations.length) continue;
            const projection = await project(
              observations,
              entries,
              options,
              policy,
              privatePolicy,
              scope,
              true
            );
            if (
              projection.records.length ||
              projection.metadataChanged ||
              latest.attribution?.policyHash !== scope.attributionPolicyHash
            ) {
              const batch: ScanBatch = {
                source: latest.source,
                observations: [],
                nextCheckpoint: { ...latest.checkpoint, ...scope },
                outcome: latest.outcome,
                diagnostics: latest.diagnostics,
              };
              for (const chunk of projectionChunks(projection)) {
                options.signal.throwIfAborted();
                await options.store.commitBatch(
                  batch.source,
                  batch,
                  chunk.records,
                  chunk.metadata
                );
              }
              entries = await options.store.journal();
            }
          } catch {
            if (options.signal.aborted) options.signal.throwIfAborted();
            // Earlier chunks remain durable even if a later source chunk fails.
            entries = await options.store.journal();
            result.sourceOutcomes.push({
              provider: group[0].source.provider,
              sourceIdentity: group[0].source.sourceIdentity,
              outcome: "unavailable",
              diagnostics: [{ code: "incomplete-source", severity: "warning" }],
            });
          }
        }
      });
      const discovery = await discoverSources({
        repositoryId: policy.repositoryId,
        disabledProviders: policy.disabledProviders,
        adapters: options.adapters ?? {
          codex: codexAdapter,
          claude: claudeAdapter,
        },
        roots: options.roots ?? {},
        signal: options.signal,
        target: options.target,
      });
      result.sourceOutcomes.push(...discovery.outcomes);
      for (const { source, adapter } of discovery.sources) {
        if (options.signal.aborted) break;
        try {
          await options.store.withLock(options.signal, async () => {
            const candidate = await options.store.checkpointCandidate(source);
            for await (const batch of adapter.scan(
              source,
              candidate,
              options.signal,
              scope
            )) {
              options.signal.throwIfAborted();
              if (
                batch.nextCheckpoint.repositoryId !== scope.repositoryId ||
                batch.nextCheckpoint.normalizationVersion !==
                  scope.normalizationVersion ||
                batch.nextCheckpoint.attributionPolicyHash !==
                  scope.attributionPolicyHash ||
                identity(batch.source) !== identity(source)
              )
                throw new Error("invalid-record");
              const entries = await options.store.journal();
              const projection = await project(
                batch.observations,
                entries,
                options,
                policy,
                privatePolicy,
                scope
              );
              if (
                batch.observations.length ||
                projection.records.length ||
                !isDeepStrictEqual(candidate, batch.nextCheckpoint) ||
                batch.outcome === "unavailable" ||
                batch.outcome === "unsupported"
              )
                await options.store.commitBatch(
                  batch.source,
                  batch,
                  projection.records,
                  projection.metadata
                );
              result.sourceOutcomes.push({
                provider: source.provider,
                sourceIdentity: source.sourceIdentity,
                outcome: batch.outcome,
                diagnostics: batch.diagnostics,
              });
            }
          });
        } catch {
          result.sourceOutcomes.push({
            provider: source.provider,
            sourceIdentity: source.sourceIdentity,
            outcome: "unavailable",
            diagnostics: [
              {
                code: options.signal.aborted ? "timeout" : "incomplete-source",
                severity: "warning",
              },
            ],
          });
        }
      }
    } catch {
      failure();
    }
  result.cancelled = options.signal.aborted;
  try {
    result.queuedHashes = (await options.store.pending())
      .map(recordHash)
      .sort();
  } catch {
    failure();
  }
  return result;
}
