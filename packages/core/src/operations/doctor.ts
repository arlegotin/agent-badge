import type { RepositoryContext } from '../git/context.js';
import type { IntegrationPort, OperationalCheck } from './integration-port.js';
import { configurationState, getStatus } from './status.js';
import type { StatusReport } from './status.js';
import { reportCapabilities } from '../providers/capability-report.js';
import type { CapabilityReport } from '../providers/capability-report.js';
import { DataTransport, TransportError } from '../git/data-transport.js';
import { readStoreSnapshot } from '../storage/store.js';
import { ProtocolError } from '../domain/capabilities.js';
async function bounded<T>(promise:Promise<T>,signal:AbortSignal):Promise<T> {
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>reject(new Error('diagnostic-deadline'));
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
export interface DoctorOptions { remote?: boolean; timeoutMs?: number; integrations?: IntegrationPort }
export interface DoctorReport { schemaVersion: 1; status: 'healthy' | 'attention-required'; exitCode: 0 | 1 | 2 | 3 | 4; remote: 'not-requested' | 'readable' | 'unavailable' | 'wrong-target' | 'history-conflict'; configuration: StatusReport['configuration']; checks: OperationalCheck[]; capabilities?: CapabilityReport }
export async function diagnose(ctx: RepositoryContext, options: DoctorOptions): Promise<DoctorReport> {
  const timeout = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 20000) throw new Error('Invalid diagnostic deadline.');
  const deadline = Date.now() + timeout, signal = AbortSignal.timeout(timeout);
  const report: DoctorReport = { schemaVersion: 1, status: 'attention-required', exitCode: 1, remote: 'not-requested', configuration: 'not-inspected', checks: [] };
  try {
    const inspection = options.integrations ? await bounded(options.integrations.inspect(ctx, signal), signal) : { setup: 'not-inspected' as const, checks: [] };
    report.checks.push(...inspection.checks);
    for (const code of ['activation','runtime','git-hooks','provider-hooks']) {
      if (!report.checks.some(check => check.code === code && check.required)) report.checks.push({ code, status: 'not-inspected', required: true });
    }
    const status = await bounded(getStatus(ctx, { inspection, signal, deadline }), signal);
    report.checks.push({ code: 'local-schema', status: status.failure ? 'fail' : 'pass', required: true });
    report.configuration = status.configuration;
    if (inspection.repositoryId) report.capabilities = await bounded(reportCapabilities({ repositoryId: inspection.repositoryId, enrolledRoots: [], signal }, { roots: inspection.roots }), signal);
    let special: DoctorReport['exitCode'] = status.exitCode === 2 || status.exitCode === 3 ? status.exitCode : 0;
    if (options.remote) {
      let transport: DataTransport | undefined;
      try {
        if (inspection.binding?.status !== 'bound') throw new TransportError('routing-changed');
        transport = await DataTransport.open({ repository: ctx, binding: inspection.binding, deadline, signal });
        const snapshot = await bounded(readStoreSnapshot(ctx), signal);
        const tip = await transport.remoteTip();
        if (!tip && (snapshot.transport || inspection.binding.ledgerEvidence)) throw new TransportError('history-rewritten');
        if (tip) {
          const accepted = await transport.fetch();
          if (accepted.meta.repositoryId !== inspection.binding.repositoryId) throw new TransportError('routing-changed');
          if (snapshot.transport?.commit) await transport.assertDescendant(accepted.commit, snapshot.transport.commit, accepted.artifacts);
          report.configuration = configurationState(accepted.meta, inspection, snapshot.pendingConfiguration !== null);
        }
        report.remote = 'readable';
        report.checks.push({ code: 'remote-readable', status: 'pass', required: true });
        for(const code of ['remote-write-permission-unproven','branch-rules-unproven','commit-signing-unproven','private-image-unproven']) report.checks.push({ code, status: 'not-inspected', required: false });
      } catch (error) {
        const wrong = error instanceof TransportError && error.reason !== 'unavailable';
        const history = error instanceof TransportError && error.reason === 'history-rewritten';
        report.remote = history ? 'history-conflict' : wrong ? 'wrong-target' : 'unavailable';
        if (history) report.checks.push({ code: 'remote-history', status: 'fail', required: true });
        special = wrong ? 2 : error instanceof ProtocolError ? 3 : 1;
        report.checks.push({ code: 'remote-readable', status: 'fail', required: true });
      } finally { await transport?.close(); }
    }
    report.checks.push({ code: 'shared-policy', status: report.configuration === 'drift' ? 'fail' : report.configuration === 'current' ? 'pass' : 'warning', required: true });
    const failed = report.checks.some(check => check.required && check.status !== 'pass' && check.status !== 'warning');
    report.exitCode = special || (report.configuration === 'drift' ? 4 : failed ? 1 : 0);
    report.status = report.exitCode ? 'attention-required' : 'healthy';
    return report;
  } catch {
    if(options.remote)report.remote='unavailable';
    report.checks.push({ code: 'inspection-unavailable', status: 'fail', required: true });
    return report;
  }
}
