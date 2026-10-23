import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
it('documentation validates parsed CLI examples on unsupported native Windows', () => {
  const result=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',"Object.defineProperty(process,'platform',{value:'win32'});await import('./scripts/verify-docs.mjs');"],{encoding:'utf8',env:process.env});
  expect(result).toContain('Documentation verification passed:');
});
