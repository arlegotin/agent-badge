import { resolveRepository, uninstall } from '@legotin/agent-badge-core';
import { repositoryIntegrations } from '../integration/operations.js';
export async function runUninstallCommand(options:{cwd?:string}={}) {
  return uninstall({repository:await resolveRepository(options.cwd??process.cwd()),integrations:repositoryIntegrations});
}
