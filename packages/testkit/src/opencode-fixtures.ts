import { readFile } from "node:fs/promises";
interface ExportInfo { id: string; projectID: string; time: { created: number; updated: number }; fork?: { sessionID: string; boundary: number } }
export interface OpenCodeV1Export { info: ExportInfo & { directory: string; version: string; title: string }; messages: Record<string, unknown>[] }
export interface OpenCodeV2Export { info: ExportInfo & { location: { directory: string }; cost: number; tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } } }; messages: Record<string, unknown>[] }
export interface OpenCodeV2ApiExport { data: OpenCodeV2Export }
export function openCodeExport(version: '1.19.3', format?: 'cli'): Promise<OpenCodeV1Export>;
export function openCodeExport(version: '2.1.2', format?: 'cli'): Promise<OpenCodeV2Export>;
export function openCodeExport(version: string, format: 'api'): Promise<OpenCodeV2ApiExport>;
export function openCodeExport(version: string, format?: 'cli'): Promise<OpenCodeV1Export | OpenCodeV2Export>;
export function openCodeExport(version: string, format: 'cli' | 'api'): Promise<OpenCodeV1Export | OpenCodeV2Export | OpenCodeV2ApiExport>;
/** Supplied sanitized projections only. No commands, native stores or servers. */
export async function openCodeExport(
  version: string,
  format: "cli" | "api" = "cli"
): Promise<OpenCodeV1Export | OpenCodeV2Export | OpenCodeV2ApiExport> {
  const name =
    version === "1.19.3"
      ? "v1-export.json"
      : format === "api"
      ? "v2-api-export.json"
      : "v2-export.json";
  return JSON.parse(
    await readFile(
      new URL("../fixtures/opencode/" + name, import.meta.url),
      "utf8"
    )
  );
}
