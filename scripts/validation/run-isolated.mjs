// Test/development isolation only. Production installation does not use this runner.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
const args = process.argv.slice(2);
if (!args.length) throw Error('Usage: node scripts/validation/run-isolated.mjs <command> [args...]');
const node = process.env.AGENT_BADGE_TEST_NODE ?? process.execPath;
const fixtureTemp = await realpath(tmpdir());
const root = await mkdtemp(join(tmpdir(), 'agent-badge-validation-'));
const env = {};
// Deliberate allowlist: no agent variables, auth, proxy, npm config, Node injection or Git overrides.
for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL', 'TERM'])
  if (process.env[key]) env[key] = process.env[key];
try {
  for (const name of ['home', 'cache', 'config', 'data', 'tmp', 'hooks', 'appdata', 'localappdata']) await mkdir(join(root, name));
  const gitConfig = join(root, 'gitconfig');
  await writeFile(gitConfig, '[credential]\n\thelper =\n');
  for (const name of ['user.npmrc', 'global.npmrc']) await writeFile(join(root, name), '');
  Object.assign(env, {
    PATH: dirname(node) + (process.platform === 'win32' ? ';' : ':') + (env.PATH ?? ''),
    HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), APPDATA: join(root, 'appdata'), LOCALAPPDATA: join(root, 'localappdata'),
    XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'),
    TMPDIR: fixtureTemp, TMP: fixtureTemp, TEMP: fixtureTemp,
    GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never',
    npm_config_userconfig: join(root, 'user.npmrc'), npm_config_globalconfig: join(root, 'global.npmrc'), npm_config_cache: join(root, 'cache'),
    npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false',
    AGENT_BADGE_TEST_NODE: node, AGENT_BADGE_TEST_PROVIDER_ROOTS: JSON.stringify({ codex: [], claude: [], gemini: [], opencode: [] })
  });
  const bundledNpm = process.platform === 'win32' && /^(npm|npm\.cmd)$/i.test(args[0]);
  const child = spawn(bundledNpm ? node : args[0], bundledNpm ? [join(dirname(node), 'node_modules/npm/bin/npm-cli.js'), ...args.slice(1)] : args.slice(1), { env, stdio: 'inherit' });
  process.exitCode = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', (code) => accept(code ?? 1)); });
} finally { await rm(root, { recursive: true, force: true }); }
