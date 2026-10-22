import { readFile } from "node:fs/promises";
/** Supplied sanitized projections only. No commands, native stores or servers. */
export async function openCodeExport(
  version: string,
  format: "cli" | "api" = "cli"
): Promise<any> {
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
