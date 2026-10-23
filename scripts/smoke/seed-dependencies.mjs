// Separate read-only acquisition phase; the registry smoke itself has no external routes.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../..'), directory = resolve(process.argv[2] ?? 'artifacts/dependency-closure');
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
const projects = ['@legotin/agent-badge-core', '@legotin/agent-badge', 'create-agent-badge'];
const entries = new Map();
async function visit(dependencies) {
  for (const name of Object.keys(dependencies ?? {})) {
    if (projects.includes(name) || entries.has(name)) continue;
    const entry = lock.packages['node_modules/' + name];
    if (!entry || !entry.version || !entry.integrity?.startsWith('sha512-') || !entry.resolved) throw Error('Missing exact production dependency lock: ' + name);
    const url = new URL(entry.resolved);
    if (url.origin !== 'https://registry.npmjs.org' || url.username || url.password) throw Error('Unapproved dependency route');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error('Dependency acquisition failed: HTTP ' + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
    if (integrity !== entry.integrity) throw Error('Public dependency lock integrity mismatch');
    const filename = name.replaceAll('/', '-').replaceAll('@', '') + '-' + entry.version + '.tgz';
    await writeFile(resolve(directory, filename), bytes);
    entries.set(name, { name, version: entry.version, filename, size: bytes.length, integrity });
    await visit(entry.dependencies);
  }
}
await mkdir(directory, { recursive: true });
for (const path of ['core', 'agent-badge', 'create-agent-badge']) await visit(JSON.parse(await readFile(resolve(root, 'packages', path, 'package.json'), 'utf8')).dependencies);
await writeFile(resolve(directory, 'closure.json'), JSON.stringify([...entries.values()], null, 2) + '\n');
console.log(JSON.stringify({ status: 'acquired-public-dependencies-read-only', packages: [...entries.values()] }, null, 2));
