/** Strict canonical temporary fixture guard shared by owned benchmark/receiver helpers. */
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname } from 'node:path';
export async function assertOwnedGitFixture(path: string): Promise<string> {
  const root = await realpath(path), temporary = await realpath(tmpdir());
  if (dirname(root) !== temporary || !/^agent-badge-git-[A-Za-z0-9_-]+$/.test(basename(root))) throw Error('Exact synthetic temporary Git fixture required');
  return root;
}
