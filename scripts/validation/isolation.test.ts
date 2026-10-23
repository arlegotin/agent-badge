import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { it, expect } from 'vitest';
it('portable runner hides synthetic native/auth settings and creates empty provider roots', () => {
  const result = execFileSync(process.execPath, ['scripts/validation/run-isolated.mjs', process.execPath, '--input-type=module', '-e', `
    import {readdirSync,readFileSync} from 'node:fs';
    console.log(JSON.stringify({auth:process.env.GH_TOKEN, native:process.env.CLAUDE_PROJECT_DIR, home:process.env.HOME, node:process.execPath, profile:process.env.USERPROFILE, appdata:process.env.APPDATA, localappdata:process.env.LOCALAPPDATA, options:process.env.NODE_OPTIONS, roots:JSON.parse(process.env.AGENT_BADGE_TEST_PROVIDER_ROOTS), git:readFileSync(process.env.GIT_CONFIG_GLOBAL,'utf8')}));
  `], { cwd: resolve('.'), encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'SYNTHETIC_SENTINEL', CLAUDE_PROJECT_DIR: '/synthetic/secret', USERPROFILE:'/synthetic/profile', APPDATA:'/synthetic/appdata', LOCALAPPDATA:'/synthetic/localappdata', NODE_OPTIONS:'--enable-source-maps', AGENT_BADGE_TEST_NODE: process.execPath } });
  const value = JSON.parse(result);
  expect(value.auth).toBeUndefined(); expect(value.native).toBeUndefined(); expect(value.home).not.toBe(process.env.HOME);
  expect(value.node).toBe(process.execPath); expect(value.profile).toBe(value.home); expect(value.options).toBeUndefined(); expect(value.appdata).not.toBe('/synthetic/appdata'); expect(value.localappdata).not.toBe('/synthetic/localappdata'); expect(value.roots).toEqual({ codex: [], claude: [], gemini: [], opencode: [] });
  expect(value.git).toContain('helper =');
});
