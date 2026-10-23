import type { runInitCommand } from '../commands/init.js';
import type { runCollectCommand } from '../commands/collect.js';
import type { runSyncCommand } from '../commands/sync.js';
import type { runStatusCommand } from '../commands/status.js';
import type { runDoctorCommand } from '../commands/doctor.js';
import type { runExplainCommand } from '../commands/explain.js';
import type { runControlCommand } from '../commands/controls.js';
import type { runImportCommand } from '../commands/import.js';
import type { runNormalizedImportCommand } from '../commands/normalized-import.js';
import type { runConfigureCommand } from '../commands/configure.js';
import type { runUpgradeCommand } from '../commands/upgrade.js';
import type { runUninstallCommand } from '../commands/uninstall.js';

/** Only handler-owned safe summaries enter presentation; no exceptions or private ledger bodies. */
export interface CliResults {
  init: Awaited<ReturnType<typeof runInitCommand>>;
  setup: CliResults['init'];
  collect: Awaited<ReturnType<typeof runCollectCommand>>;
  sync: Awaited<ReturnType<typeof runSyncCommand>>;
  status: Awaited<ReturnType<typeof runStatusCommand>>;
  doctor: Awaited<ReturnType<typeof runDoctorCommand>>;
  explain: Awaited<ReturnType<typeof runExplainCommand>>;
  include: Awaited<ReturnType<typeof runControlCommand>>;
  exclude: CliResults['include'];
  contribute: { status: 'written'; exitCode: 0; path: string; records: number };
  import: (Omit<Awaited<ReturnType<typeof runImportCommand>>, 'accepted'> & { exitCode: number }) | Awaited<ReturnType<typeof runNormalizedImportCommand>>;
  configure: Awaited<ReturnType<typeof runConfigureCommand>>;
  upgrade: Awaited<ReturnType<typeof runUpgradeCommand>>;
  uninstall: Awaited<ReturnType<typeof runUninstallCommand>>;
}
export function formatPlaintext(command: keyof CliResults, result: CliResults[keyof CliResults]): string[] {
  const lines = [`agent-badge: ${command} ${'status' in result ? result.status : result.state}.`];
  const add = (line: string) => lines.push(`  ${line}`);
  if ('changes' in result) for (const change of result.changes) add(`${change.action} ${change.path}`);
  if ('runtimeVersion' in result && result.runtimeVersion) add(`Runtime: ${result.runtimeVersion}`);
  if ('hooks' in result && result.hooks) add(`Git hooks: ${result.hooks}; provider hooks: ${result.providerHooks}`);
  if ('badge' in result && result.badge) add(`Badge image: ${result.badge.status}; private image support: ${result.badge.privateImageSupport}`);
  if ('nativeTrust' in result && result.nativeTrust) add(`Native trust: ${result.nativeTrust}`);
  if ('coverage' in result) add(`Coverage: ${result.coverage}`);
  if ('actionItems' in result) for (const item of result.actionItems) add(`Action: ${item}`);
  if ('setup' in result) add(`Setup: ${result.setup}`);
  if ('configuration' in result) add(`Configuration: ${result.configuration}`);
  if ('failure' in result && result.failure) add(`Failure: ${result.failure}`);
  if ('lastConfirmedSync' in result) add(`Last confirmed sync: ${result.lastConfirmedSync ?? 'none'}`);
  if ('confirmedCommit' in result) add(`Confirmed commit: ${result.confirmedCommit ?? 'none'}`);
  if ('totals' in result && result.totals) {
    const totals = result.totals;
    add(`${totals.recordedUnits} recorded units; ${totals.includedUnits} included; ${totals.excludedUnits} excluded; ${totals.conflictingUnits} conflicting; ${totals.partialUnits} partial.`);
    add(`${totals.knownTokens} known tokens; ${totals.unknownTokenUnits} units with unknown tokens; repository completeness ${totals.repositoryCompleteness}.`);
  }
  if ('valuation' in result && result.valuation) add(`Current catalog estimate (${result.valuation.catalogAuthority}, version ${result.valuation.catalogVersion}, snapshot ${result.valuation.catalogSnapshotDate}); not an invoice.`);
  if ('queuedRecords' in result) add(`${result.queuedRecords ?? 'unknown'} queued records.`);
  if ('pendingReconciliation' in result) add(`Reconciliation pending: ${result.pendingReconciliation ? 'yes' : 'no'}`);
  if ('providers' in result) for (const provider of result.providers) add(`Provider ${provider.provider}: ${provider.outcome}${provider.diagnostics.length ? '; diagnostics ' + provider.diagnostics.join(', ') : ''}`);
  if ('capabilities' in result && result.capabilities) for (const provider of result.capabilities.integrations) {
    add(`Coverage ${provider.provider}: ${provider.detection}; accounting ${provider.accounting}; coverage ${provider.manifest.coverage}`);
    if (provider.limits.length) add(`Limits ${provider.provider}: ${provider.limits.join(', ')}`);
    if (provider.diagnostics.length) add(`Diagnostics ${provider.provider}: ${provider.diagnostics.map(diagnostic => diagnostic.code).join(', ')}`);
  }
  if ('attribution' in result) {
    add(`Provider: ${result.provider}; representation: ${result.representation}; quality: ${result.quality}; lineage: ${result.lineage}`);
    add(result.attribution ? `Attribution: ${result.attribution.status} (${result.attribution.reason})` : 'Attribution: unavailable');
    add(`Historical proof: ${result.attribution?.historicalProof ? 'yes' : 'no'}. Explanation is redacted.`);
    if (result.diagnostics.length) add(`Diagnostics: ${result.diagnostics.join(', ')}`);
  }
  if ('checks' in result) {
    add(`Remote: ${result.remote}`);
    for (const check of result.checks) add(`${check.code}: ${check.status} (${check.required ? 'required' : 'optional'})`);
  }
  if ('deactivated' in result) {
    add(`Automation deactivated: ${result.deactivated ? 'yes' : 'no'}`);
    for (const item of result.unresolved) add(`Unresolved: ${item}`);
    if (result.unresolved.length) add('Review unresolved integrations and retained ownership evidence before retrying uninstall.');
    add(`Preserved: ${result.preserved.join(', ')}`);
  }
  if ('path' in result) { add(`Contribution: ${result.path}; ${result.records} records.`); add('Stage this contribution with your normal PR.'); }
  if ('complete' in result) add(`${result.confirmedEnvelopes} confirmed envelopes; complete ${result.complete}. Retain envelopes for retry until complete.`);
  if ('recordConfirmed' in result) add(`Control record confirmed: ${result.recordConfirmed ? 'yes' : 'no'}`);
  return lines;
}
