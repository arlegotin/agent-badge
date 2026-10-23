import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  parseProtocol,
  sourceDescriptorSchema,
} from "../domain/capabilities.js";
import type {
  Diagnostic,
  ProviderAdapter,
  ProviderId,
  SourceDescriptor,
  ScanOutcome,
} from "../domain/capabilities.js";
import type { UsageObservation } from "../domain/usage.js";
import { resolveRepository } from "../git/context.js";
import type { RepositoryContext } from "../git/context.js";
import { runGit } from "../git/process.js";
import { canonicalRemoteUrl } from "../git/remote-binding.js";
import { containsPath } from "./attribution.js";
import type {
  PrivateAttributionPolicy,
  ResolvedAttributionEvidence,
} from "./attribution.js";

/** No path prefix can establish live membership: resolve the nearest Git boundary first. */
export async function resolveAttributionEvidence(
  observation: UsageObservation,
  repository: RepositoryContext,
  privatePolicy: PrivateAttributionPolicy
): Promise<ResolvedAttributionEvidence> {
  const evidence: ResolvedAttributionEvidence = {
    cwd: "unavailable",
    commonDir: null,
    targetCommonDir: repository.commonDir,
    nested: false,
    remoteUrl: null,
    historicalMembership: false,
  };
  const cwd = observation.execution.cwd;
  if (cwd === null || !isAbsolute(cwd)) return evidence;
  try {
    const nearest = await resolveRepository(cwd);
    evidence.cwd = "resolved";
    evidence.commonDir = nearest.commonDir;
    evidence.nested =
      nearest.commonDir !== repository.commonDir &&
      (nearest.superprojectRoot !== null ||
        [
          repository.worktreeRoot,
          ...repository.worktrees.map((worktree) => worktree.path),
        ].some((root) => containsPath(root, nearest.worktreeRoot)));
    const remote = await runGit(["remote", "get-url", "origin"], {
      cwd: nearest.worktreeRoot,
      timeoutMs: 500,
    });
    if (remote.status === "ok") {
      const canonical = canonicalRemoteUrl(
        remote.stdout.trim(),
        nearest.worktreeRoot
      );
      evidence.remoteUrl = canonical?.startsWith("github.com/")
        ? "https://" + canonical
        : canonical;
    }
  } catch {
    try {
      await stat(cwd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        evidence.cwd = "missing";
    }
    // A historical path is only useful when no live repository can contradict it.
    evidence.historicalMembership =
      evidence.cwd === "missing" &&
      privatePolicy.verifiedWorktrees.some(
        (value) =>
          value.commonDir === repository.commonDir &&
          containsPath(value.path, cwd)
      );
  }
  return evidence;
}
export interface SourceOutcome {
  provider: ProviderId;
  sourceIdentity?: string;
  outcome: ScanOutcome | "empty" | "disabled";
  diagnostics: Diagnostic[];
}
export interface SourceTarget {
  provider?: ProviderId;
  sourceIdentity?: string;
}
export type ProviderAdapters = Partial<Record<ProviderId, ProviderAdapter>>;
export type ProviderRoots = Partial<Record<ProviderId, readonly string[]>>;
export interface DiscoverOptions {
  lazyEpoch?: boolean;
  repositoryId: string;
  disabledProviders: readonly ProviderId[];
  adapters: ProviderAdapters;
  roots: ProviderRoots;
  signal: AbortSignal;
  target?: SourceTarget;
}
/** Hints filter discovered identities. They never become a SourceDescriptor or grant path access. */
export async function discoverSources(options: DiscoverOptions): Promise<{
  sources: { source: SourceDescriptor; adapter: ProviderAdapter }[];
  outcomes: SourceOutcome[];
}> {
  const sources: { source: SourceDescriptor; adapter: ProviderAdapter }[] = [],
    outcomes: SourceOutcome[] = [];
  for (const [id, adapter] of Object.entries(options.adapters) as [
    ProviderId,
    ProviderAdapter
  ][]) {
    if (options.signal.aborted) break;
    if (options.target?.provider && options.target.provider !== id) continue;
    if (options.disabledProviders.includes(id)) {
      outcomes.push({ provider: id, outcome: "disabled", diagnostics: [] });
      continue;
    }
    try {
      const roots = options.roots[id] ?? [];
      if (roots.some((root) => !isAbsolute(root)))
        throw new Error("invalid-record");
      const discovered = await adapter.discover({
        repositoryId: options.repositoryId,
        enrolledRoots: [...roots],
        signal: options.signal,
        lazyEpoch: options.lazyEpoch,
      });
      const unique = new Map<string, SourceDescriptor>();
      for (const value of discovered) {
        const source = parseProtocol(sourceDescriptorSchema, value);
        if (
          source.provider !== id ||
          !isAbsolute(source.root) ||
          !isAbsolute(source.instanceKey) ||
          !isAbsolute(source.sourceIdentity)
        )
          throw new Error("invalid-record");
        if (
          !containsPath(source.instanceKey, source.root) ||
          !containsPath(source.instanceKey, source.sourceIdentity)
        ) {
          outcomes.push({
            provider: id,
            outcome: "unsupported",
            diagnostics: [{ code: "unsupported-source", severity: "warning" }],
          });
          continue;
        }
        unique.set(
          JSON.stringify([source.instanceKey, source.sourceIdentity]),
          source
        );
      }
      if (unique.size === 0)
        outcomes.push({ provider: id, outcome: "empty", diagnostics: [] });
      for (const source of unique.values())
        if (
          !options.target?.sourceIdentity ||
          options.target.sourceIdentity === source.sourceIdentity
        )
          sources.push({ source, adapter });
    } catch {
      outcomes.push({
        provider: id,
        outcome: "unavailable",
        diagnostics: [
          {
            code: options.signal.aborted ? "timeout" : "unavailable-source",
            severity: "warning",
          },
        ],
      });
    }
  }
  return { sources, outcomes };
}
