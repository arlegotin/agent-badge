import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
  discoveryContextSchema,
  parseProtocol,
  ProtocolError,
} from "../domain/capabilities.js";
import type {
  CapabilityManifest,
  Diagnostic,
  DiscoveryContext,
  ProviderId,
} from "../domain/capabilities.js";
import type { ProviderRoots } from "../collection/source-resolver.js";
import {
  createCodexAdapter,
  codexCapabilityManifest,
} from "./codex/adapter.js";
import {
  createClaudeAdapter,
  claudeCapabilityManifest,
} from "./claude/adapter.js";
import {
  createGeminiAdapter,
  geminiCapabilityManifest,
} from "./gemini/adapter.js";
import {
  createOpenCodeAdapter,
  opencodeCapabilityManifest,
} from "./opencode/adapter.js";
import { normalizedImportCapabilityManifest } from "./normalized-import.js";
export interface IntegrationCapability {
  provider: ProviderId;
  detection: "detected" | "absent" | "unavailable" | "explicit-only";
  accounting: CapabilityManifest["accounting"];
  manifest: CapabilityManifest;
  diagnostics: Diagnostic[];
  /** Local explanation codes, never provider payloads, paths, credentials or numerical totals. */
  limits: readonly string[];
}
export interface CapabilityReport {
  integrations: IntegrationCapability[];
}
export interface CapabilityReportOptions {
  home?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  /** DiscoveryContext is per-provider; this report needs explicit per-provider roots. */
  roots?: ProviderRoots;
}
function unsupported(provider: "cursor" | "copilot"): CapabilityManifest {
  return {
    provider,
    normalizationVersion: 1,
    accounting: "unsupported",
    sourceSchemas: [],
    fixtureReferences: [],
    identity: "unsupported",
    revision: "unordered",
    coverage: "unsupported",
    forks: "unsupported",
    modelSegmentation: "unknown",
  };
}
/** Read local presence/allowlisted discovery only. No executable, listener, network, settings or credential probes. */
export async function reportCapabilities(
  input: DiscoveryContext,
  options: CapabilityReportOptions = {}
): Promise<CapabilityReport> {
  const ctx = parseProtocol(discoveryContextSchema, input);
  if (ctx.enrolledRoots.length) throw new ProtocolError("invalid-record");
  const home = options.home ?? homedir(),
    environment = options.environment ?? process.env;
  const integrations: IntegrationCapability[] = [];
  const defaultRoots = {
    codex: environment.CODEX_HOME?.trim() || join(home, ".codex"),
    claude: environment.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude"),
    gemini: join(
      environment.GEMINI_CLI_HOME?.trim() || home,
      ...(environment.SANDBOX === "sandbox-exec"
        ? [".cache", ".gemini"]
        : [".gemini"])
    ),
    opencode: join(
      environment.XDG_DATA_HOME || join(home, ".local", "share"),
      "opencode"
    ),
  };
  const registered = [
    {
      manifest: codexCapabilityManifest,
      adapter: createCodexAdapter({ environment }),
      limits: ["recorded-final-requests-only"],
    },
    {
      manifest: claudeCapabilityManifest,
      adapter: createClaudeAdapter({ environment }),
      limits: ["native-numeric-accounting-uncertified"],
    },
    {
      manifest: geminiCapabilityManifest,
      adapter: createGeminiAdapter({ environment }),
      limits: ["recorded-success-only", "historical-coverage-partial"],
    },
    {
      manifest: opencodeCapabilityManifest,
      adapter: createOpenCodeAdapter({ environment }),
      limits: [
        "projected-fork-import-lineage-uncertified",
        "v2-event-persistence-off-by-default",
      ],
    },
  ];
  for (const { manifest, adapter, limits } of registered) {
    let detection: IntegrationCapability["detection"] = "absent";
    const diagnostics: Diagnostic[] = [];
    let accounting: CapabilityManifest["accounting"] = "unsupported";
    const provider = manifest.provider as keyof typeof defaultRoots,
      explicit = options.roots?.[provider];
    const paths = explicit ?? [defaultRoots[provider]],
      present: string[] = [];
    for (const path of paths) {
      if (!isAbsolute(path)) throw new ProtocolError("invalid-record");
      try {
        ctx.signal.throwIfAborted();
        await lstat(path);
        present.push(path);
        detection = "detected";
      } catch (error) {
        if (
          ctx.signal.aborted ||
          explicit ||
          (error as NodeJS.ErrnoException).code !== "ENOENT"
        ) {
          detection = "unavailable";
          diagnostics.push({
            code: ctx.signal.aborted ? "timeout" : "unavailable-source",
            severity: "warning",
          });
        }
      }
    }
    if (present.length)
      try {
        const sources = await adapter.discover({
          ...ctx,
          enrolledRoots: present,
        });
        if (
          sources.some(
            (source) =>
              source.generation === "unavailable" ||
              source.schema.includes("unavailable")
          )
        )
          diagnostics.push({ code: "unavailable-source", severity: "warning" });
        if (sources.some((source) => source.schema.includes("unsupported")))
          diagnostics.push({ code: "unsupported-source", severity: "warning" });
        if (
          manifest.accounting === "fixture-certified" &&
          sources.some((source) =>
            manifest.sourceSchemas.includes(source.schema)
          )
        )
          accounting = "fixture-certified";
      } catch {
        detection = "unavailable";
        diagnostics.push({
          code: ctx.signal.aborted ? "timeout" : "unavailable-source",
          severity: "warning",
        });
      }
    integrations.push({
      provider: manifest.provider,
      detection,
      accounting,
      manifest,
      diagnostics,
      limits,
    });
  }
  for (const provider of ["cursor", "copilot"] as const) {
    let detection: IntegrationCapability["detection"] = "absent";
    const diagnostics: Diagnostic[] = [];
    const explicit = options.roots?.[provider],
      paths = explicit ?? [join(home, "." + provider)];
    for (const path of paths) {
      if (!isAbsolute(path)) throw new ProtocolError("invalid-record");
      try {
        ctx.signal.throwIfAborted();
        await lstat(path);
        detection = "detected";
      } catch (error) {
        if (
          ctx.signal.aborted ||
          explicit ||
          (error as NodeJS.ErrnoException).code !== "ENOENT"
        ) {
          detection = "unavailable";
          diagnostics.push({
            code: ctx.signal.aborted ? "timeout" : "unavailable-source",
            severity: "warning",
          });
        }
      }
    }
    const limits =
      provider === "cursor"
        ? [
            "context-occupancy-is-not-spend",
            "native-token-source-not-fixture-certified",
          ]
        : [
            "optional-request-otel-not-fixture-certified",
            "organization-pr-totals-not-repository-receipts",
          ];
    integrations.push({
      provider,
      detection,
      accounting: "unsupported",
      manifest: unsupported(provider),
      diagnostics,
      limits,
    });
  }
  integrations.push({
    provider: "import",
    detection: "explicit-only",
    accounting: normalizedImportCapabilityManifest.accounting,
    manifest: normalizedImportCapabilityManifest,
    diagnostics: [],
    limits: [
      "explicit-producer-assertion",
      "independent-origin-not-automatically-verifiable",
      "coverage-partial",
    ],
  });
  return { integrations };
}
