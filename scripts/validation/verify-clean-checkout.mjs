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
  // Native actions are unsupported. Exercise safe parser, API and launcher rejection.
  run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'packages/agent-badge/src/cli/platform.test.ts', 'scripts/smoke/windows-setup-result.test.ts', 'scripts/validation/isolation.test.ts', 'scripts/validation/platform-docs.test.ts', '--maxWorkers=1']);
} else run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=1']);
run(process.execPath, ['scripts/smoke/verify-packed-install.mjs', candidate]);
run(process.execPath, ['scripts/smoke/verify-initializer-install.mjs', candidate, closure]);
