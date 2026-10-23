#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface RunCreateAgentBadgeOptions { argv?: string[]; nodeVersion?: string }
/** Parse through the shared CLI. Loading the initializer performs no setup. */
export async function runCreateAgentBadge(options: RunCreateAgentBadgeOptions = {}): Promise<void> {
  if (!/^(24|26)\./.test(options.nodeVersion ?? process.versions.node)) throw new Error("agent-badge requires Node 24 or 26.");
  const args = options.argv ?? process.argv.slice(2);
  const forwarded = args.length === 0 || (args[0].startsWith("-") && !["--help", "-h", "--version"].includes(args[0])) ? ["init", ...args] : args;
  const { run } = await import("@legotin/agent-badge/cli");
  await run([process.execPath, "agent-badge", ...forwarded], { nodeVersion: options.nodeVersion });
}
export const main = runCreateAgentBadge;
export function isDirectExecution(argv: readonly string[] = process.argv): boolean {
  try { return typeof argv[1] === "string" && fileURLToPath(import.meta.url) === realpathSync(argv[1]); } catch { return false; }
}
if (isDirectExecution()) {
  void runCreateAgentBadge().catch((error: unknown) => {
    // Preserve the lightweight early gate, then share the CLI's static boundary.
    if (!/^(24|26)\./.test(process.versions.node)) {
      console.error("agent-badge requires Node 24 or 26."); process.exitCode = 1; return;
    }
    return import("@legotin/agent-badge/cli").then(({ handleRunError }) => handleRunError(error)).catch(() => {
      console.error("agent-badge: operation unavailable; run doctor."); process.exitCode = 1;
    });
  });
}
