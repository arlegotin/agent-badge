import {afterEach,expect,test,vi} from 'vitest';
import {readGitBlobSizes} from './objects.js';
import * as process from './process.js';
const oid='a'.repeat(40),other='b'.repeat(40);
afterEach(()=>vi.restoreAllMocks());
test.each([
  `${oid} blob -1\n`,`${oid} blob 1.5\n`,`${oid} blob 262145\n`,
  `${oid} tree 1\n`,`${other} blob 1\n`,`${oid} missing\n`,
  `${oid} blob 1`,`${oid} blob 1\n${oid} blob 1\n`,
])('bounded blob metadata rejects malformed, oversized or mismatched framing: %s',async stdout=>{
  vi.spyOn(process,'runGit').mockResolvedValue({status:'ok',exitCode:0,stdout,stderr:''});
  await expect(readGitBlobSizes('/synthetic',[oid],{signal:AbortSignal.timeout(2000),deadline:Date.now()+2000})).rejects.toThrow();
});
test('bounded blob metadata permits exact zero/max sizes and caps the process response before content reads',async()=>{
  const command=vi.spyOn(process,'runGit').mockResolvedValue({status:'ok',exitCode:0,stdout:`${oid} blob 0\n${other} blob 262144\n`,stderr:''});
  expect(await readGitBlobSizes('/synthetic',[oid,other],{signal:AbortSignal.timeout(2000),deadline:Date.now()+2000})).toEqual([0,262144]);
  expect(command.mock.calls[0][1]).toMatchObject({maxOutputBytes:256,input:oid+'\n'+other+'\n'});
});
