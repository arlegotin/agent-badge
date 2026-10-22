import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { buildProgram, handleRunError, isDirectExecution } from './main.js';
afterEach(() => { process.exitCode=undefined; vi.restoreAllMocks(); });

test('runtime exposes the complete repository-native contract with no legacy aliases', () => {
  const commands = buildProgram().commands.map(c=>c.name()).sort();
  expect(commands).toEqual(['collect','configure','contribute','doctor','exclude','explain','import','include','init','setup','status','sync','uninstall','upgrade']);
});

test('help version and invalid options have no repository side effects', async () => {
  const cwd = await mkdtemp(join(tmpdir(),'agent-badge-cli-'));
  try {
    const output: string[] = [];
    for (const args of [['--help'],['--version'],['status','--unknown']]) {
      const program = buildProgram({cwd,write:line=>output.push(line)}).exitOverride();
      for(const command of [program,...program.commands])command.configureOutput({writeOut:line=>output.push(line),writeErr:line=>output.push(line)});
      await expect(program.parseAsync(args,{from:'user'})).rejects.toBeDefined();
      expect(await readdir(cwd)).toEqual([]);
    }
    expect(output.join('')).toContain('collect');

  } finally { await rm(cwd,{recursive:true,force:true}); }
});

test('symlinked bin executes directly and errors never echo untrusted provider diagnostics', async () => {
  const root = await mkdtemp(join(tmpdir(),'agent-badge-bin-'));
  try { const link=join(root,'badge'); await symlink(new URL('./main.ts',import.meta.url),link); expect(isDirectExecution([process.execPath,link])).toBe(true); }
  finally { await rm(root,{recursive:true,force:true}); }
  const error=vi.fn(); handleRunError(new Error('/private/provider/secret token=credential'),{error});
  expect(error.mock.calls.flat().join('')).not.toMatch(/secret|credential|\/private/);
  expect(process.exitCode).toBe(1);
});
