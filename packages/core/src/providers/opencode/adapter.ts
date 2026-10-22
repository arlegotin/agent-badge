import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  checkpointScopeSchema,
  parseProtocol,
  sourceDescriptorSchema,
} from "../../domain/capabilities.js";
import type {
  Checkpoint,
  CheckpointScope,
  ProviderAdapter,
  SourceDescriptor,
} from "../../domain/capabilities.js";
import {
  DEFAULT_MAX_BYTES,
  emptyHash,
  readSourceFile,
  sourceFileEpoch,
} from "../source-file.js";
import { inspectOpenCodeExport, OPENCODE_READER_VERSION } from "./reader.js";
import type { OpenCodeExportFormat } from "./reader.js";
export interface OpenCodeAdapterOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  /** Data root presence only; never open the native store. */
  defaultHome?: string;
  /** Owner-supplied files, with explicit producer version and CLI/API wrapper. No executable/API access. */
  exports?: readonly {
    path: string;
    version: string;
    format: OpenCodeExportFormat;
  }[];
  maxBytes?: number;
}
export function createOpenCodeAdapter(
  options: OpenCodeAdapterOptions = {}
): ProviderAdapter {
  const environment = options.environment ?? process.env,
    maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 16 * 1024 * 1024 ||
    (options.exports?.length ?? 0) > 1000
  )
    throw new Error("invalid-record");
  const exports = new Map(
    (options.exports ?? []).map((value) => {
      if (!isAbsolute(value.path)) throw new Error("invalid-record");
      return [resolve(value.path), { ...value }];
    })
  );
  return {
    async discover(ctx) {
      const sources: SourceDescriptor[] = [];
      for (const [path] of exports) {
        ctx.signal.throwIfAborted();
        let generation = "unavailable";
        try {
          if (!(await lstat(path)).isSymbolicLink())
            generation = (await sourceFileEpoch(path)).generation;
        } catch {
          /* Visible unavailable source. */
        }
        sources.push({
          provider: "opencode",
          instanceKey: dirname(path),
          root: path,
          sourceIdentity: path,
          generation,
          schema: "opencode-supplied-export",
          readerVersion: OPENCODE_READER_VERSION,
        });
      }
      const roots = ctx.enrolledRoots.length
        ? ctx.enrolledRoots
        : [
            options.defaultHome ??
              join(
                environment.XDG_DATA_HOME || join(homedir(), ".local", "share"),
                "opencode"
              ),
          ];
      for (const root of roots) {
        ctx.signal.throwIfAborted();
        const path = resolve(root);
        let unavailable = false;
        try {
          await lstat(path);
        } catch (error) {
          if (
            !ctx.enrolledRoots.length &&
            (error as NodeJS.ErrnoException).code === "ENOENT"
          )
            continue;
          unavailable = true;
        }
        sources.push({
          provider: "opencode",
          instanceKey: path,
          root: path,
          sourceIdentity: path,
          generation: unavailable ? "unavailable" : "detection",
          schema: unavailable
            ? "opencode-unavailable"
            : "opencode-native-uncertified",
          readerVersion: OPENCODE_READER_VERSION,
        });
      }
      return sources;
    },
    async *scan(input, _checkpoint, signal, inputScope) {
      const source = parseProtocol(sourceDescriptorSchema, input),
        scope = parseProtocol(checkpointScopeSchema, inputScope),
        checkpoint = makeCheckpoint(source, scope);
      const supplied = exports.get(source.root);
      if (
        source.provider !== "opencode" ||
        source.schema !== "opencode-supplied-export" ||
        source.readerVersion !== OPENCODE_READER_VERSION ||
        !supplied
      ) {
        yield {
          source,
          observations: [],
          nextCheckpoint: checkpoint,
          outcome:
            source.schema === "opencode-unavailable"
              ? "unavailable"
              : "unsupported",
          diagnostics: [
            {
              code:
                source.schema === "opencode-unavailable"
                  ? "unavailable-source"
                  : "unsupported-source",
              severity: "warning",
            },
          ],
        };
        return;
      }
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
            nextCheckpoint: checkpoint,
            outcome: "partial",
            diagnostics: [{ code: "incomplete-source", severity: "warning" }],
          };
          return;
        }
        const inspection = inspectOpenCodeExport(
          read.bytes,
          supplied.version,
          supplied.format
        );
        yield {
          source,
          observations: [],
          nextCheckpoint: checkpoint,
          outcome: "unsupported",
          diagnostics: [{ code: inspection.reason, severity: "warning" }],
        };
      } catch {
        yield {
          source,
          observations: [],
          nextCheckpoint: checkpoint,
          outcome: "unavailable",
          diagnostics: [
            {
              code: signal.aborted ? "timeout" : "unavailable-source",
              severity: "warning",
            },
          ],
        };
      }
    },
  };
}
function makeCheckpoint(
  source: SourceDescriptor,
  scope: CheckpointScope
): Checkpoint {
  return {
    schemaVersion: 1,
    provider: source.provider,
    instanceKey: source.instanceKey,
    sourceIdentity: source.sourceIdentity,
    sourceGeneration: source.generation,
    sourceSchema: source.schema,
    readerVersion: source.readerVersion,
    ...scope,
    continuation: null,
    cursor: { offset: 0, size: 0, prefixHash: emptyHash, incompleteTail: "" },
  };
}
export const opencodeAdapter = createOpenCodeAdapter();
export { opencodeCapabilityManifest } from "./identity.js";
