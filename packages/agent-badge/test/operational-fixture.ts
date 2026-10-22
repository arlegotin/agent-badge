import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBareRemoteFixture } from '@agent-badge/testkit';
import { planSetup, applySetup } from '../src/integration/setup.js';
export const version = '2.0.0-next.0';
export function pin(runtimeVersion = version) { return { manifest: JSON.stringify({ name: 'agent-badge-runtime', private: true, dependencies: { '@legotin/agent-badge': runtimeVersion } }), lock: JSON.stringify({ name: 'agent-badge-runtime', lockfileVersion: 3, packages: { '': { name: 'agent-badge-runtime', dependencies: { '@legotin/agent-badge': runtimeVersion } }, 'node_modules/@legotin/agent-badge': { version: runtimeVersion, resolved: `https://registry.npmjs.org/@legotin/agent-badge/-/agent-badge-${runtimeVersion}.tgz`, integrity: 'sha512-c3ludGhldGlj' } } }) }; }
export async function install(directory: string) {
  const runtimeVersion = JSON.parse(await (await import('node:fs/promises')).readFile(join(directory,'package.json'),'utf8')).dependencies['@legotin/agent-badge'];
  const root = join(directory, 'node_modules/@legotin/agent-badge'); await mkdir(join(root, 'dist/cli'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@legotin/agent-badge', version: runtimeVersion }));
  await writeFile(join(root, 'dist/cli/main.js'), 'process.stdout.write("synthetic-runtime\\n")');
  await mkdir(join(root, 'dist/integration'), { recursive: true });
  await writeFile(join(root, 'dist/integration/runtime.js'), 'export const fixture = true;');
  await writeFile(join(root, 'dist/integration/runtime-worker.js'), 'export const fixture = true;');
}
export const setupOptions = { nodeVersion: '24.0.0', runtimeVersion: version, resolvePin: async (v: string) => pin(v), installRuntime: install,
  runInitialOperation: async () => ({ status: 'queued', acknowledgedCount: 0, queuedCount: null, pendingReconciliation: true, exitCode: 1 }) };
export async function activatedFixture() {
  const f = await createBareRemoteFixture(), cwd = f.clones[0];
  const plan = await planSetup({ ...setupOptions, cwd, target: 'origin', declaredUrl: 'https://github.com/example/repo' });
  await applySetup(plan);
  return { f, cwd, plan };
}
