import { createHash } from "node:crypto";
import { lstat, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  checkpointSchema,
  checkpointScopeSchema,
  parseProtocol,
  sourceDescriptorSchema,
} from "../../domain/capabilities.js";
import type {
  Checkpoint,
  CheckpointScope,
  Diagnostic,
  ProviderAdapter,
  SourceDescriptor,
} from "../../domain/capabilities.js";
import {
  DEFAULT_MAX_BYTES,
  emptyHash,
  readSourceFile,
  sourceFileEpoch,
} from "../source-file.js";
import {
  GEMINI_JSONL_SCHEMA,
  GEMINI_JSON_SCHEMA,
  GEMINI_READER_VERSION,
  geminiContinuationSchema,
  parseGeminiSession,
} from "./reader.js";
export interface GeminiAdapterOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  defaultHome?: string;
  maxBytes?: number;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const diagnostic = (code: Diagnostic["code"]): Diagnostic => ({
  code,
  severity: "warning",
});
const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(".." + sep) &&
    !isAbsolute(rel)
  );
};
/** Read ONLY registry and allowlisted saved-session paths; never initialize provider storage. */
async function registry(
  root: string,
  signal: AbortSignal
): Promise<Map<string, string>> {
  const path = join(root, "projects.json");
  if ((await lstat(path)).isSymbolicLink())
    throw new Error("unsupported-source");
  const epoch = await sourceFileEpoch(path);
  if (!inside(root, epoch.identity)) throw new Error("unsupported-source");
  const read = await readSourceFile(
    path,
    1024 * 1024,
    signal,
    epoch.generation
  );
  if (read.bounded) throw new Error("incomplete-source");
  const value: unknown = JSON.parse(read.bytes.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("unsupported-source");
  const projects = (value as { projects?: unknown }).projects;
  if (
    !projects ||
    typeof projects !== "object" ||
    Array.isArray(projects) ||
    Object.keys(projects).length > 10000
  )
    throw new Error("unsupported-source");
  const result = new Map<string, string>();
  for (const [cwd, id] of Object.entries(projects)) {
    // Preserve exact registry path bytes: upstream getProjectHash hashes projectRoot verbatim.
    if (
      !isAbsolute(cwd) ||
      cwd.length > 4096 ||
      typeof id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(id) ||
      result.has(id)
    )
      throw new Error("unsupported-source");
    result.set(id, cwd);
  }
  return result;
}
export function createGeminiAdapter(
  options: GeminiAdapterOptions = {}
): ProviderAdapter {
  const environment = options.environment ?? process.env,
    maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 64 * 1024 * 1024
  )
    throw new Error("invalid-record");
  return {
    async discover(ctx) {
      const home = environment.GEMINI_CLI_HOME?.trim() || homedir();
      const roots = ctx.enrolledRoots.length
        ? ctx.enrolledRoots
        : [
            options.defaultHome ||
              join(
                home,
                ...(environment.SANDBOX === "sandbox-exec"
                  ? [".cache", ".gemini"]
                  : [".gemini"])
              ),
          ];
      const sources = new Map<string, SourceDescriptor>();
      const descriptor = (
        root: string,
        path: string,
        schema: string,
        generation: string
      ): SourceDescriptor => ({
        provider: "gemini",
        instanceKey: root,
        root: path,
        schema,
        generation,
        readerVersion: GEMINI_READER_VERSION,
        sourceIdentity: path,
      });
      for (const input of roots) {
        ctx.signal.throwIfAborted();
        let root: string;
        try {
          root = await realpath(input);
        } catch {
          if (
            ctx.enrolledRoots.length ||
            options.defaultHome ||
            environment.GEMINI_CLI_HOME
          )
            sources.set(
              resolve(input),
              descriptor(
                resolve(input),
                resolve(input),
                "gemini-unavailable",
                "unavailable"
              )
            );
          continue;
        }
        let projects: Map<string, string>;
        try {
          projects = await registry(root, ctx.signal);
        } catch {
          sources.set(
            root,
            descriptor(root, root, "gemini-unsupported-registry", "unsupported")
          );
          continue;
        }
        let visited = 0,
          partial = false;
        const paths: string[] = [];
        const walk = async (directory: string, depth: number) => {
          ctx.signal.throwIfAborted();
          if (++visited > 20000) {
            partial = true;
            return;
          }
          // No symlinked directory traversal, even if a final file resolves back inside the root.
          try {
            const s = await lstat(directory);
            if (!s.isDirectory() || s.isSymbolicLink()) {
              partial = true;
              return;
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT")
              partial = true;
            return;
          }
          const entries = await readdir(directory, { withFileTypes: true });
          for (const entry of entries) {
            ctx.signal.throwIfAborted();
            if (++visited > 20000 || paths.length >= 10000) {
              partial = true;
              break;
            }
            if (entry.isDirectory() && depth === 0)
              await walk(join(directory, entry.name), 1);
            else if (
              entry.isFile() &&
              ((depth === 0 && /^session-.+\.(jsonl|json)$/.test(entry.name)) ||
                (depth === 1 && /^[a-zA-Z0-9_-]+\.jsonl$/.test(entry.name)))
            )
              paths.push(join(directory, entry.name));
          }
        };
        for (const id of projects.keys()) {
          const tmp = join(root, "tmp"),
            project = join(tmp, id);
          let safe = true;
          for (const parent of [tmp, project])
            try {
              if ((await lstat(parent)).isSymbolicLink()) safe = false;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                safe = false;
            }
          if (safe) await walk(join(project, "chats"), 0);
          else partial = true;
        }
        for (const path of paths.sort())
          try {
            const epoch = await sourceFileEpoch(path);
            if (!inside(root, epoch.identity)) {
              partial = true;
              continue;
            }
            sources.set(
              epoch.identity,
              descriptor(
                root,
                epoch.identity,
                path.endsWith(".jsonl")
                  ? GEMINI_JSONL_SCHEMA
                  : GEMINI_JSON_SCHEMA,
                epoch.generation
              )
            );
          } catch {
            sources.set(
              path,
              descriptor(root, path, "gemini-unavailable", "unavailable")
            );
          }
        if (partial)
          sources.set(
            root,
            descriptor(root, root, "gemini-discovery-partial", "discovery")
          );
      }
      return [...sources.values()];
    },
    async *scan(input, inputCheckpoint, signal, inputScope) {
      const discovered = parseProtocol(sourceDescriptorSchema, input),
        scope = parseProtocol(checkpointScopeSchema, inputScope);
      let source = discovered;
      const initial = makeCheckpoint(source, scope);
      if (
        source.provider !== "gemini" ||
        ![GEMINI_JSONL_SCHEMA, GEMINI_JSON_SCHEMA].includes(source.schema) ||
        source.readerVersion !== GEMINI_READER_VERSION
      ) {
        const unavailable = source.schema === "gemini-unavailable";
        yield {
          source,
          observations: [],
          nextCheckpoint: initial,
          outcome: unavailable ? "unavailable" : "unsupported",
          diagnostics: [
            diagnostic(
              unavailable ? "unavailable-source" : "unsupported-source"
            ),
          ],
        };
        return;
      }
      try {
        const projects = await registry(source.instanceKey, signal),
          parts = relative(source.instanceKey, source.root).split(sep);
        if (
          parts[0] !== "tmp" ||
          parts[2] !== "chats" ||
          ![4, 5].includes(parts.length) ||
          !inside(source.instanceKey, source.root)
        )
          throw new Error("unsupported-source");
        const cwd = projects.get(parts[1]);
        if (!cwd) throw new Error("unsupported-source");
        const projectHash = hash(cwd);
        const parsed = checkpointSchema.safeParse(inputCheckpoint),
          candidate =
            parsed.success &&
            parsed.data.provider === "gemini" &&
            parsed.data.instanceKey === source.instanceKey &&
            parsed.data.sourceIdentity === source.sourceIdentity
              ? parsed.data
              : null;
        const cp =
          candidate &&
          candidate.sourceSchema === source.schema &&
          candidate.readerVersion === source.readerVersion &&
          candidate.repositoryId === scope.repositoryId &&
          candidate.normalizationVersion === scope.normalizationVersion &&
          candidate.attributionPolicyHash === scope.attributionPolicyHash
            ? candidate
            : null;
        let state;
        if (
          cp?.continuation?.provider === "gemini" &&
          cp.continuation.readerVersion === GEMINI_READER_VERSION
        )
          try {
            const parsed = geminiContinuationSchema.safeParse(
              JSON.parse(cp.continuation.state)
            );
            if (
              parsed.success &&
              parsed.data.physicalEpoch === source.generation &&
              parsed.data.projectHash === projectHash
            )
              state = parsed.data;
          } catch {
            /* Replay untrusted continuation. */
          }
        const read = await readSourceFile(
          source.root,
          maxBytes,
          signal,
          source.generation,
          source.schema === GEMINI_JSONL_SCHEMA && state && cp
            ? cp.cursor
            : undefined
        );
        if (read.identity !== source.sourceIdentity)
          throw new Error("incomplete-source");
        source = {
          ...source,
          generation:
            read.resumed && candidate
              ? candidate.sourceGeneration
              : candidate
              ? hash(
                  JSON.stringify([
                    source.generation,
                    candidate.sourceGeneration,
                    read.prefixHash,
                    scope,
                    "reset",
                  ])
                )
              : source.generation,
        };
        if (source.schema === GEMINI_JSON_SCHEMA && read.bounded) {
          yield {
            source,
            observations: [],
            nextCheckpoint: makeCheckpoint(source, scope),
            outcome: "partial",
            diagnostics: [diagnostic("incomplete-source")],
          };
          return;
        }
        const result = parseGeminiSession(
          read.bytes,
          source,
          cwd,
          projectHash,
          read.resumed ? state : undefined
        );
        result.state.physicalEpoch = discovered.generation;
        const nextCheckpoint = parseProtocol(checkpointSchema, {
          ...makeCheckpoint(source, scope),
          continuation: {
            provider: "gemini",
            readerVersion: GEMINI_READER_VERSION,
            state: JSON.stringify(result.state),
          },
          cursor: {
            offset: read.start + result.offset,
            size: read.size,
            prefixHash: read.hashThrough(result.offset),
            incompleteTail: "",
          },
        });
        yield {
          source,
          observations: result.observations,
          nextCheckpoint,
          outcome: "partial",
          diagnostics: result.diagnostics,
        };
      } catch {
        yield {
          source: discovered,
          observations: [],
          nextCheckpoint: initial,
          outcome: "unavailable",
          diagnostics: [
            diagnostic(signal.aborted ? "timeout" : "incomplete-source"),
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
    provider: "gemini",
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
export const geminiAdapter = createGeminiAdapter();
export {
  geminiAccountingContract,
  geminiCapabilityManifest,
} from "./identity.js";
