import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
if (process.env.AGENT_BADGE_TEST_NODE !== process.execPath) throw Error('Run via scripts/validation/run-isolated.mjs');
const npm = 'npm';
function run(command, args) {
  if (command === npm && process.platform === 'win32') { command = process.execPath; args = [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args]; }
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const candidate = resolve(process.argv[2] ?? 'artifacts/candidate'), closure = resolve(process.argv[3] ?? 'artifacts/dependency-closure');
for (const name of ['typecheck', 'build', 'docs:check', 'pack:check']) run(npm, ['run', name]);
if (process.platform === 'win32') {
  // Automatic supervision is unsupported. Receiver/process-group tests remain POSIX-only.
  run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'packages/agent-badge/src/integration/hooks.test.ts', '-t', 'Windows automatic', '--maxWorkers=1']);
} else run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=1']);
run(process.execPath, ['scripts/smoke/verify-packed-install.mjs', candidate]);
run(process.execPath, ['scripts/smoke/verify-initializer-install.mjs', candidate, closure]);
