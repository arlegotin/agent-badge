import type { RepositoryContext } from '../git/context.js';
import type { SharedPolicy } from '../domain/policy.js';
import type { RemoteBinding } from '../git/remote-binding.js';
import type { ProviderRoots } from '../collection/source-resolver.js';

export interface OperationalCheck { code: string; status: 'pass' | 'warning' | 'fail' | 'not-inspected'; required: boolean }
export interface IntegrationInspection {
  setup: 'approved' | 'needs-setup' | 'suspended' | 'missing-runtime' | 'not-inspected';
  repositoryId?: string;
  /** Actual branch declaration, absent on an older branch; never substitute activation policy. */
  policy?: SharedPolicy;
  binding?: RemoteBinding;
  roots?: ProviderRoots;
  checks: OperationalCheck[];
}
export interface DeactivationResult {
  deactivated: boolean;
  unresolved: string[];
}
/** Integration ownership stays with the installing package. Core never imports CLI. */
export interface IntegrationPort {
  inspect(ctx: RepositoryContext, signal: AbortSignal): Promise<IntegrationInspection>;
  deactivate(ctx: RepositoryContext, signal: AbortSignal): Promise<DeactivationResult>;
}
