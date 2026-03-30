import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ProviderName = "codex" | "claude";
export type ProviderHomeLabel = "~/.codex" | "~/.claude";

export interface ProviderAvailability {
  readonly available: boolean;
  readonly homeLabel: ProviderHomeLabel;
}

export interface ProviderDetectionResult {
  readonly codex: ProviderAvailability;
  readonly claude: ProviderAvailability;
}

export interface DetectProviderAvailabilityOptions {
  readonly homeRoot?: string;
}

function buildProviderAvailability(
  homeRoot: string,
  provider: ProviderName
): ProviderAvailability {
  const directoryName = provider === "codex" ? ".codex" : ".claude";

  return {
    available: existsSync(join(homeRoot, directoryName)),
    homeLabel: `~/${directoryName}` as ProviderHomeLabel
  };
}

export function detectProviderAvailability(
  options: DetectProviderAvailabilityOptions = {}
): ProviderDetectionResult {
  const homeRoot = options.homeRoot ?? homedir();

  return {
    codex: buildProviderAvailability(homeRoot, "codex"),
    claude: buildProviderAvailability(homeRoot, "claude")
  };
}
