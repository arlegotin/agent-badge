import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  applyAmbiguousSessionDecision,
  applyCompletedScanState,
  attributeBackfillSessions,
  buildAmbiguousSessionKey,
  formatScanReport,
  parseAgentBadgeConfig,
  parseAgentBadgeState,
  runFullBackfillScan,
  type AgentBadgeState,
  type AppliedScanOverrideAction,
  type AttributeBackfillSessionsResult,
  type RunFullBackfillScanResult
} from "@agent-badge/core";

interface OutputWriter {
  write(chunk: string): unknown;
}

export interface RunScanCommandOptions {
  readonly cwd?: string;
  readonly homeRoot?: string;
  readonly stdout?: OutputWriter;
  readonly includeSession?: string[];
  readonly excludeSession?: string[];
}

export interface ScanCommandResult {
  readonly scan: RunFullBackfillScanResult;
  readonly attribution: AttributeBackfillSessionsResult;
  readonly state: AgentBadgeState;
  readonly overrideActions: readonly AppliedScanOverrideAction[];
  readonly warnings: readonly string[];
  readonly report: string;
}

const CONFIG_PATH = ".agent-badge/config.json";
const STATE_PATH = ".agent-badge/state.json";

async function readJsonFile(targetPath: string): Promise<unknown> {
  let rawContent: string;

  try {
    rawContent = await readFile(targetPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ".";

    throw new Error(`Unable to read ${targetPath}${detail}`);
  }

  try {
    return JSON.parse(rawContent) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ".";

    throw new Error(`Unable to parse ${targetPath}${detail}`);
  }
}

async function writeStateFile(
  targetPath: string,
  state: AgentBadgeState
): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function writeLine(stdout: OutputWriter, line: string): void {
  stdout.write(`${line}\n`);
}

function applyRequestedOverrides(
  previousState: AgentBadgeState,
  attribution: AttributeBackfillSessionsResult,
  options: RunScanCommandOptions
): {
  readonly nextState: AgentBadgeState;
  readonly overrideActions: readonly AppliedScanOverrideAction[];
  readonly warnings: readonly string[];
} {
  const ambiguousSessionKeys = new Set(
    attribution.sessions
      .filter((session) => session.status === "ambiguous")
      .map((session) => buildAmbiguousSessionKey(session.session))
  );

  const requestedActions: AppliedScanOverrideAction[] = [
    ...(options.includeSession ?? []).map((sessionKey) => ({
      sessionKey,
      decision: "include" as const
    })),
    ...(options.excludeSession ?? []).map((sessionKey) => ({
      sessionKey,
      decision: "exclude" as const
    }))
  ];

  let nextState = previousState;
  const overrideActions: AppliedScanOverrideAction[] = [];
  const warnings: string[] = [];

  for (const action of requestedActions) {
    if (!ambiguousSessionKeys.has(action.sessionKey)) {
      warnings.push(
        `Warning: cannot apply ${action.decision} override for ${action.sessionKey} because it is not ambiguous in the current scan result.`
      );
      continue;
    }

    nextState = applyAmbiguousSessionDecision(
      nextState,
      action.sessionKey,
      action.decision
    );
    overrideActions.push(action);
  }

  return {
    nextState,
    overrideActions,
    warnings
  };
}

function buildReportInput(
  scan: RunFullBackfillScanResult,
  attribution: AttributeBackfillSessionsResult,
  overrideActions: readonly AppliedScanOverrideAction[]
) {
  return {
    repo: {
      canonicalSlug: scan.repo.canonicalSlug,
      gitRootBasename: scan.repo.gitRootBasename
    },
    counts: {
      ...scan.counts,
      ...attribution.counts
    },
    attributedSessions: attribution.sessions,
    overrideActions
  };
}

export async function runScanCommand(
  options: RunScanCommandOptions = {}
): Promise<ScanCommandResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const homeRoot = resolve(options.homeRoot ?? homedir());
  const stdout = options.stdout ?? process.stdout;
  const configPath = join(cwd, CONFIG_PATH);
  const statePath = join(cwd, STATE_PATH);

  const config = parseAgentBadgeConfig(await readJsonFile(configPath));
  const previousState = parseAgentBadgeState(await readJsonFile(statePath));
  const scan = await runFullBackfillScan({
    cwd,
    homeRoot,
    config
  });
  const initialAttribution = attributeBackfillSessions({
    repo: scan.repo,
    sessions: scan.sessions,
    overrides: previousState.overrides.ambiguousSessions
  });
  const requestedOverrides = applyRequestedOverrides(
    previousState,
    initialAttribution,
    options
  );
  const attribution =
    requestedOverrides.overrideActions.length === 0
      ? initialAttribution
      : attributeBackfillSessions({
          repo: scan.repo,
          sessions: scan.sessions,
          overrides: requestedOverrides.nextState.overrides.ambiguousSessions
        });
  const report = formatScanReport(
    buildReportInput(scan, attribution, requestedOverrides.overrideActions)
  );
  const nextState = applyCompletedScanState({
    previousState,
    scanResult: {
      scannedProviders: scan.scannedProviders,
      overrideActions: requestedOverrides.overrideActions
    },
    now: new Date().toISOString()
  });

  for (const warning of requestedOverrides.warnings) {
    writeLine(stdout, warning);
  }

  writeLine(stdout, report);
  await writeStateFile(statePath, nextState);

  return {
    scan,
    attribution,
    state: nextState,
    overrideActions: requestedOverrides.overrideActions,
    warnings: requestedOverrides.warnings,
    report
  };
}
