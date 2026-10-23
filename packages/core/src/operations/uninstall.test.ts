import { expect, test } from 'vitest';
import { uninstall } from './uninstall.js';
import type { RepositoryContext } from '../git/context.js';
test('uninstall requires owning integration APIs and reports deactivation/refusal independently', async () => {
  const repository = {} as RepositoryContext;
  expect(await uninstall({ repository })).toMatchObject({ status: 'action-required', deactivated: false, exitCode: 1, unresolved: ['integration-owner-unavailable'] });
  expect(await uninstall({ repository, integrations: { inspect: async () => ({ setup: 'not-inspected', checks: [] }), deactivate: async () => ({ deactivated: true, unresolved: ['git-hook-edited'] }) } })).toMatchObject({ status: 'action-required', deactivated: true, exitCode: 1, unresolved: ['git-hook-edited'], preserved: expect.arrayContaining(['private-journal','remote-ledger']) });
});
