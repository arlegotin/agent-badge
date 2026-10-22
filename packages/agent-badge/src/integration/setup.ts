import { readFile, writeFile, mkdir, mkdtemp, rename, rm, lstat, realpath, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RepositoryContext, AcceptedLedger } from '@legotin/agent-badge-core';
import type { RepositoryOperationRequest } from '@legotin/agent-badge-core/operations/runner';
import { assertSupportedNode, assertExactVersion, parseDeclaration, validatePin, json, digest, NODE_RANGE } from './manifest.js';
import type { Declaration, RuntimePin, Activation } from './manifest.js';
import { launcherSource, bootstrapSource } from './templates.js';
import { loadActivation } from './runtime.js';
const execute = promisify(execFile);
type InitialResult = { status: string; exitCode: number; acknowledgedCount: number; queuedCount: number | null; pendingReconciliation: boolean };
export interface SetupOptions {
  cwd?: string; nodeVersion?: string; runtimeVersion?: string; declaredUrl?: string; target?: string;
  privatePolicy?: unknown; roots?: Activation['roots']; timeoutMs?: number;
  /** Controlled package resolution/install ports, also used by offline distributors. */
  resolvePin?(version: string): Promise<RuntimePin>;
  installRuntime?(directory: string): Promise<void>;
  runInitialOperation?(request: RepositoryOperationRequest): Promise<InitialResult>;
}
export interface OwnedChange { path: string; before: string | null; after: string }
export interface SetupPlan {
  repository: RepositoryContext; declaration: Declaration; pin: RuntimePin; lockHash: string;
  changes: OwnedChange[]; activation: Activation; initialize: boolean;
  /** Approved private effects are separate from tracked file changes. */
  privateChanges: string[];
  options: SetupOptions;
}
export interface SetupResult { status: string; runtimeVersion: string; installed: boolean; changedFiles: string[]; operation: InitialResult }
async function contents(path: string): Promise<string | null> {
  try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('Unsafe setup file.'); return await readFile(path, 'utf8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}
async function directory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe setup directory.');
}
async function atomic(path: string, bytes: string, mode = 0o600) {
  await directory(dirname(path));
  const stage = join(dirname(path), `.agent-badge-${randomUUID()}`);
  try {
    const handle = await open(stage, 'wx', mode);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await rename(stage, path);
    const parent = await open(dirname(path), 'r');
    try { await parent.sync(); } finally { await parent.close(); }
  } finally { await rm(stage, { force: true }); }
}
async function resolveNpmPin(version: string): Promise<RuntimePin> {
  const root = await mkdtemp(join(tmpdir(), 'agent-badge-pin-'));
  try {
    const manifest = json({ name: 'agent-badge-runtime', private: true, engines: { node: NODE_RANGE }, dependencies: { '@legotin/agent-badge': version } });
    await writeFile(join(root, 'package.json'), manifest);
    await execute('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false'], { cwd: root, timeout: 120000, maxBuffer: 64 * 1024 });
    return { manifest, lock: await readFile(join(root, 'package-lock.json'), 'utf8') };
  } catch { throw new Error('Exact runtime resolution unavailable; retry setup when online.'); }
  finally { await rm(root, { recursive: true, force: true }); }
}
async function npmInstall(directory: string) {
  try { await execute('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false'], { cwd: directory, timeout: 120000, maxBuffer: 64 * 1024 }); }
  catch { throw new Error('Runtime installation unavailable; retry setup when online.'); }
}
/** Resolves a concrete reviewable plan. Never changes the repository or activates code. */
export async function planSetup(options: SetupOptions = {}): Promise<SetupPlan> {
  assertSupportedNode(options.nodeVersion);
  if (options.runtimeVersion) assertExactVersion(options.runtimeVersion);
  const core = await import('@legotin/agent-badge-core');
  const repository = await core.resolveRepository(options.cwd ?? process.cwd());
  for (const path of [join(repository.worktreeRoot, '.agent-badge'), join(repository.worktreeRoot, '.agent-badge/runtime')]) {
    try { const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe setup directory.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const existing = await contents(join(repository.worktreeRoot, '.agent-badge/config.json'));
  const previous = existing ? parseDeclaration(JSON.parse(existing)) : null;
  const local = await loadActivation(repository.privateDir);
  const runtimeVersion = options.runtimeVersion ?? previous?.runtimeVersion ?? JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version;
  assertExactVersion(runtimeVersion);
  let declaredUrl = options.declaredUrl ?? previous?.declaredUrl;
  if (!declaredUrl) { const remote = await core.runGit(['remote', 'get-url', 'origin'], { cwd: repository.worktreeRoot }); if (remote.status !== 'ok') throw new Error('Specify a public repository URL.'); const canonical = core.canonicalRemoteUrl(remote.stdout.trim(), repository.worktreeRoot); declaredUrl = canonical?.startsWith('github.com/') ? `https://${canonical}` : remote.stdout.trim(); }
  const repositoryId = previous?.repositoryId ?? local?.repositoryId ?? randomUUID();
  let policy = core.parseSharedPolicy(previous?.policy ?? local?.capturePolicy ?? { schemaVersion: 1, repositoryId, normalizationVersion: 1, discovery: 'auto', disabledProviders: [], badge: { label: 'AI usage', metric: 'tokens' } });
  const acceptedBytes = await contents(join(repository.privateDir, 'transport.json'));
  if (acceptedBytes) {
    const accepted = core.parseTransportState(JSON.parse(acceptedBytes));
    policy = await core.loadCapturePolicy(repository, { transportState: async () => accepted }, policy, repositoryId, { signal: AbortSignal.timeout(2000), deadline: Date.now() + 2000 });
  }
  const declaration = parseDeclaration({ schemaVersion: 1, repositoryId, declaredUrl, dataRef: 'refs/heads/agent-badge/data', runtimeVersion, policy });
  const manifest = await contents(join(repository.worktreeRoot, '.agent-badge/runtime/package.json'));
  const lock = await contents(join(repository.worktreeRoot, '.agent-badge/runtime/package-lock.json'));
  const pin = previous?.runtimeVersion === runtimeVersion && manifest && lock ? { manifest, lock } : await (options.resolvePin ?? resolveNpmPin)(runtimeVersion);
  const lockHash = validatePin(pin, runtimeVersion);
  const priorBinding = local?.binding.status === 'bound' && local.repositoryId === repositoryId &&
    (await core.verifyBinding(repository, local.binding)).status === 'valid' ? local.binding : null;
  const binding = options.target === undefined && priorBinding ? priorBinding :
    await core.bindRemote(repository, { repositoryId, declaredUrl, target: options.target });
  const privatePolicy = core.parsePrivateAttributionPolicy(options.privatePolicy ?? local?.privatePolicy ?? {});
  // Historical inventory is useful only after a real membership check. Never enroll a prunable registration.
  const enrolled = new Map((local?.worktreeInventory ?? []).map(w => [w.path, w]));
  for (const worktree of repository.worktrees) {
    if (worktree.bare || worktree.prunable) continue;
    try { const verified = await core.resolveRepository(worktree.path); if (verified.commonDir === repository.commonDir) { const path = await realpath(worktree.path); enrolled.set(path, { path, commonDir: repository.commonDir }); } } catch { /* unavailable is not proof */ }
  }
  const worktreeInventory = [...enrolled.values()];
  const roots = options.roots ?? local?.roots ?? {};
  if (Object.keys(roots).some(k => !['codex', 'claude'].includes(k)) || Object.values(roots).some(paths => !Array.isArray(paths) || paths.some(p => typeof p !== 'string' || !isAbsolute(p)))) throw new Error('Invalid private provider roots.');
  const activation: Activation = { schemaVersion: 1, repositoryId, runtimeVersion, lockHash, initializeAllowed: local?.initializeAllowed ?? (!previous && !local), binding, capturePolicy: policy, privatePolicy: core.parsePrivateAttributionPolicy(privatePolicy), roots, worktreeInventory };
  if (Buffer.byteLength(json(activation)) > 200 * 1024) throw new Error('Private activation exceeds supervised input limit.');
  const block = '<!-- agent-badge:start -->\nAI coding usage: [data and coverage](' + declaration.declaredUrl.replace(/\.git$/, '') + '/tree/agent-badge/data).\n<!-- agent-badge:end -->';
  const readmeBefore = await contents(join(repository.worktreeRoot, 'README.md'));
  const pattern = /<!-- agent-badge:start -->[\s\S]*?<!-- agent-badge:end -->/g;
  const matches = readmeBefore?.match(pattern) ?? [];
  if (matches.length > 1 || (readmeBefore?.includes('<!-- agent-badge:start -->') && matches.length !== 1)) throw new Error('Ambiguous managed README block.');
  const readme = matches.length ? readmeBefore!.replace(pattern, block) : (readmeBefore ?? '').replace(/\s*$/, '') + (readmeBefore ? '\n\n' : '') + block + '\n';
  const owned: Record<string, string> = { '.agent-badge/config.json': json(declaration), '.agent-badge/run.cjs': launcherSource,
    '.agent-badge/runtime/package.json': pin.manifest, '.agent-badge/runtime/package-lock.json': pin.lock,
    '.agent-badge/README.md': '# Agent Badge\n\nRequires Node 24 or 26 and npm. Each clone needs explicit activation:\n\n```sh\nnode .agent-badge/run.cjs setup\n```\n\nOnly local agent usage can be collected. CI cannot discover histories on another machine. Initial state may be queued or unavailable; see [data and coverage](' + declaration.declaredUrl.replace(/\.git$/, '') + '/tree/agent-badge/data). No measurement is a claim of complete coverage or a bill.\n',
    'README.md': readme };
  const ownershipPath = '.agent-badge/ownership.json';
  const priorOwnership = await contents(join(repository.worktreeRoot, ownershipPath));
  const ownership = priorOwnership ? JSON.parse(priorOwnership) : null;
  for (const [path, after] of Object.entries(owned)) {
    const before = await contents(join(repository.worktreeRoot, path));
    if (path !== 'README.md' && before !== null && before !== after && (!ownership || ownership.schemaVersion !== 1 || ownership.files?.[path] !== digest(before))) {
      // Configuration is intentionally user editable, but launcher/pins must remain owned.
      if (path !== '.agent-badge/config.json') throw new Error('Owned setup file was modified; reconcile explicitly.');
    }
  }
  owned[ownershipPath] = json({ schemaVersion: 1, files: Object.fromEntries(Object.entries(owned).filter(([p]) => p !== 'README.md').map(([p, value]) => [p, digest(value)])), readmeBlock: 'agent-badge' });
  const changes: OwnedChange[] = [];
  for (const [path, after] of Object.entries(owned)) { const before = await contents(join(repository.worktreeRoot, path)); if (before !== after) changes.push({ path, before, after }); }
  return { repository, declaration, pin, lockHash, activation, changes, initialize: activation.initializeAllowed,
    privateChanges: [`runtime/${lockHash}`, 'bootstrap.cjs', 'local.json'], options };
}
async function verifyRuntime(path: string, version: string) {
  const root = join(path, 'node_modules/@legotin/agent-badge');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (pkg.version !== version || !await contents(join(root, 'dist/cli/main.js')) || !await contents(join(root, 'dist/integration/runtime.js'))) throw new Error('Installed runtime version mismatch.');
}
export async function applySetup(plan: SetupPlan): Promise<SetupResult> {
  assertSupportedNode(plan.options.nodeVersion);
  if (validatePin(plan.pin, plan.declaration.runtimeVersion) !== plan.lockHash) throw new Error('Setup plan changed.');
  const core = await import('@legotin/agent-badge-core');
  if ((await core.resolveRepository(plan.repository.worktreeRoot)).commonDir !== plan.repository.commonDir) throw new Error('Repository changed after planning.');
  for (const change of plan.changes) if (await contents(join(plan.repository.worktreeRoot, change.path)) !== change.before) throw new Error('Setup files changed after planning.');
  const privateDir = plan.repository.privateDir; await directory(privateDir); await directory(join(privateDir, 'runtime'));
  const runtime = join(privateDir, 'runtime', plan.lockHash); let installed = false;
  try { await verifyRuntime(runtime, plan.declaration.runtimeVersion); }
  catch {
    const stage = await mkdtemp(join(privateDir, 'runtime', '.install-'));
    try { await writeFile(join(stage, 'package.json'), plan.pin.manifest); await writeFile(join(stage, 'package-lock.json'), plan.pin.lock);
      await (plan.options.installRuntime ?? npmInstall)(stage); await verifyRuntime(stage, plan.declaration.runtimeVersion);
      // Incomplete prior installations are never approved; only this hash-owned directory may be repaired.
      await rm(runtime, { recursive: true, force: true }); await rename(stage, runtime); installed = true;
    } catch { throw new Error('Runtime installation unavailable; retry setup when online.'); }
    finally { await rm(stage, { recursive: true, force: true }); }
  }

  for (const change of plan.changes) await atomic(join(plan.repository.worktreeRoot, change.path), change.after, 0o644);
  // Approval precedes switching executable entrypoints. A crash can leave an old approved
  // bootstrap, which fails its own runtime/pin check; it cannot start unapproved new code.
  await atomic(join(privateDir, 'local.json'), json(plan.activation));
  await atomic(join(privateDir, 'bootstrap.cjs'), bootstrapSource.replace('APPROVED_RUNTIME_HASH', plan.lockHash));
  const request: RepositoryOperationRequest = { cwd: plan.repository.worktreeRoot, privateDir, repositoryId: plan.declaration.repositoryId, binding: plan.activation.binding, collect: 'full', capturePolicy: plan.activation.capturePolicy,
    collection: { roots: plan.activation.roots, privatePolicy: plan.activation.privatePolicy } };
  if (plan.initialize) request.initialize = { meta: { schemaVersion: 2, protocolVersion: 1, repositoryId: plan.declaration.repositoryId, normalizationVersion: 1,
    catalogVersion: core.defaultCatalog.version, catalogHash: core.catalogHash(core.defaultCatalog), policy: plan.declaration.policy }, catalog: core.defaultCatalog };
  let operation: InitialResult;
  if (plan.options.runInitialOperation) operation = await plan.options.runInitialOperation(request);
  else { const { createOperationBudget } = await import('@legotin/agent-badge-core/operations/budget'); const { runRepositoryOperation } = await import('@legotin/agent-badge-core/operations/runner');
    const budget = createOperationBudget('manual', plan.options.timeoutMs ?? 120000); try { operation = await runRepositoryOperation({ request, budget }); } finally { budget.dispose(); } }
  return { status: operation.status, runtimeVersion: plan.declaration.runtimeVersion, installed, changedFiles: plan.changes.map(c => c.path), operation };
}

/** Task10 configure callback: acceptance is authoritative; checkout failure reports drift. */
export async function writeAcceptedDeclaration(repository: RepositoryContext, accepted: Pick<AcceptedLedger, 'meta'>, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const path = join(repository.worktreeRoot, '.agent-badge/config.json');
  const before = await contents(path);
  if (!before) throw new Error('Repository declaration unavailable.');
  const current = parseDeclaration(JSON.parse(before));
  const core = await import('@legotin/agent-badge-core');
  const meta = core.parseLedgerMeta(accepted.meta);
  if (meta.repositoryId !== current.repositoryId) throw new Error('Repository identity mismatch.');
  const after = json({ ...current, policy: meta.policy });
  signal.throwIfAborted();
  await atomic(path, after, 0o644);
  const ownershipPath = join(repository.worktreeRoot, '.agent-badge/ownership.json');
  const ownershipBytes = await contents(ownershipPath);
  if (ownershipBytes) {
    const ownership = JSON.parse(ownershipBytes);
    if (ownership.schemaVersion !== 1 || typeof ownership.files !== 'object') throw new Error('Invalid ownership manifest.');
    ownership.files['.agent-badge/config.json'] = digest(after);
    signal.throwIfAborted(); await atomic(ownershipPath, json(ownership), 0o644);
  }
}
