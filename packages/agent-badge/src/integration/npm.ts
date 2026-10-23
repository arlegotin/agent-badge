import { dirname, join } from 'node:path';
/** Windows Node distributions bundle npm's JS CLI beside node.exe; bypass .cmd/shell quoting. */
export function npmInvocation(args: readonly string[], platform = process.platform, node = process.execPath): { command: string; args: string[] } {
  return platform === 'win32'
    ? { command: node, args: [join(dirname(node), 'node_modules/npm/bin/npm-cli.js'), ...args] }
    : { command: 'npm', args: [...args] };
}
