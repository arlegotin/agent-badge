import type { RepositoryContext } from '../git/context.js';
import type { IntegrationPort } from './integration-port.js';
export interface UninstallOptions { repository: RepositoryContext; integrations?: IntegrationPort; signal?: AbortSignal }
export interface UninstallResult { schemaVersion: 1; status: 'removed' | 'action-required'; exitCode: 0 | 1; deactivated: boolean; unresolved: string[]; preserved: readonly string[] }
export async function uninstall(options: UninstallOptions): Promise<UninstallResult> {
  const result: UninstallResult = { schemaVersion: 1, status: 'action-required', exitCode: 1, deactivated: false,
    unresolved: [], preserved: ['private-journal','checkpoints','accepted-history','remote-ledger','unknown-files','runtime-cache','active-or-unknown-leases','legacy-private-ignore-rules'] };
  if (!options.integrations) return { ...result, unresolved: ['integration-owner-unavailable'] };
  try {
    const removed = await options.integrations.deactivate(options.repository, options.signal ?? AbortSignal.timeout(10000));
    const complete = removed.deactivated && removed.unresolved.length === 0;
    return { ...result, ...removed, status: complete ? 'removed' : 'action-required', exitCode: complete ? 0 : 1 };
  } catch { return { ...result, unresolved: ['integration-removal-unavailable'] }; }
}
