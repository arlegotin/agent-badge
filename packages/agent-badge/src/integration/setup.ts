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
import { githubRepositoryUrl } from './workflow.js';
import { loadActivation } from './runtime.js';
import { planHooks, applyHookPlan } from './hooks.js';
import type { HookPlan, HookInstallResult } from './hooks.js';
import { planAgentHooks, applyAgentHookPlan } from './agent-hooks.js';
import type { AgentHookPlan, AgentHookResult } from './agent-hooks.js';
const execute = promisify(execFile);
type InitialResult = { status: string; exitCode: number; acknowledgedCount: number; queuedCount: number | null; pendingReconciliation: boolean };
export interface SetupOptions {
  importWorkflow?: boolean;
  /** Controlled read-only Git advertisement port; production uses bounded Git. */
  readWorkflowRemoteHead?: import('./workflow.js').ReadWorkflowRemoteHead;
  cwd?: string; newRepository?: boolean; nodeVersion?: string; runtimeVersion?: string; declaredUrl?: string; target?: string;
  privatePolicy?: unknown; roots?: Activation['roots']; timeoutMs?: number;
  /** Controlled package resolution/install ports, also used by offline distributors. */
  resolvePin?(version: string): Promise<RuntimePin>;
  installRuntime?(directory: string): Promise<void>;
  runInitialOperation?(request: RepositoryOperationRequest): Promise<InitialResult>;
}
export interface OwnedChange { path: string; before: string | null; after: string }
export interface SetupPlan {
  badge: { status: 'public-route' | 'unsupported-host'; privateImageSupport: 'unverified' };
  repository: RepositoryContext; declaration: Declaration; pin: RuntimePin; lockHash: string;
  changes: OwnedChange[]; activation: Activation; initialize: boolean;
  /** Approved private effects are separate from tracked file changes. */
  privateChanges: string[];
  options: SetupOptions;
  hooks: HookPlan; agentHooks: AgentHookPlan;
}
export interface SetupResult { status: string; runtimeVersion: string; installed: boolean; changedFiles: string[]; operation: InitialResult; hooks: HookInstallResult; agentHooks: AgentHookResult }
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
interface SetupIntent { schemaVersion: 1; repositoryId: string; initializeAllowed: true }
async function loadSetupIntent(privateDir: string): Promise<SetupIntent | null> {
  try {
    const info = await lstat(privateDir);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid())) throw new Error('Unsafe private setup directory.');
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  const bytes = await contents(join(privateDir, 'setup-intent.json'));
  if (!bytes) return null;
  const intent = JSON.parse(bytes) as SetupIntent;
  if (Buffer.byteLength(bytes) > 4096 || !intent || Object.keys(intent).sort().join(',') !== 'initializeAllowed,repositoryId,schemaVersion' ||
      intent.schemaVersion !== 1 || intent.initializeAllowed !== true || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(intent.repositoryId)) throw new Error('Invalid private setup intent.');
  return intent;
}
/** Owning uninstall seam: strict interrupted intent is removed, unknown evidence retained. */
export async function removeSetupIntent(privateDir: string): Promise<void> {
  if (await loadSetupIntent(privateDir)) await rm(join(privateDir, 'setup-intent.json'));
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
  const intent = await loadSetupIntent(repository.privateDir);
  const local = await loadActivation(repository.privateDir);
  if (options.newRepository) {
    // A private directory can contain accepted/journaled usage even without local.json.
    const privateExists = await lstat(repository.privateDir).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (privateExists) throw new Error('Standalone identity requires a fresh clone without Badge private state; use another clone.');
    if (!options.declaredUrl) throw new Error('Standalone setup requires an explicit repository URL.');
  }
  const runtimeVersion = options.runtimeVersion ?? previous?.runtimeVersion ?? JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version;
  assertExactVersion(runtimeVersion);
  let declaredUrl = options.declaredUrl ?? previous?.declaredUrl;
  if (!declaredUrl) { const remote = await core.runGit(['remote', 'get-url', 'origin'], { cwd: repository.worktreeRoot }); if (remote.status !== 'ok') throw new Error('Specify a public repository URL.'); const canonical = core.canonicalRemoteUrl(remote.stdout.trim(), repository.worktreeRoot); declaredUrl = canonical?.startsWith('github.com/') ? `https://${canonical}` : remote.stdout.trim(); }
  const repositoryId = options.newRepository ? randomUUID() : previous?.repositoryId ?? local?.repositoryId ?? intent?.repositoryId ?? randomUUID();
  if (intent && intent.repositoryId !== repositoryId) throw new Error('Private setup intent identity mismatch.');
  let policy = core.parseSharedPolicy((options.newRepository ? undefined : previous?.policy ?? local?.capturePolicy) ?? { schemaVersion: 1, repositoryId, normalizationVersion: 1, discovery: 'auto', disabledProviders: [], badge: { label: 'AI usage', metric: 'tokens' } });
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
  if (Object.keys(roots).some(k => !['codex', 'claude', 'gemini'].includes(k)) || Object.values(roots).some(paths => !Array.isArray(paths) || paths.some(p => typeof p !== 'string' || !isAbsolute(p)))) throw new Error('Invalid private provider roots.');
  const activation: Activation = { schemaVersion: 1, repositoryId, runtimeVersion, lockHash, initializeAllowed: options.newRepository || (local?.initializeAllowed ?? (intent?.initializeAllowed ?? (!previous && !local))), binding, capturePolicy: policy, privatePolicy: core.parsePrivateAttributionPolicy(privatePolicy), roots, worktreeInventory };
  const hooks = await planHooks(repository, { privateDir: repository.privateDir, nodePath: process.execPath });
  const agentHooks = await planAgentHooks(repository.worktreeRoot, repository);
  if (Buffer.byteLength(json(activation)) > 200 * 1024) throw new Error('Private activation exceeds supervised input limit.');
  const github = githubRepositoryUrl(declaration.declaredUrl, repository.worktreeRoot);
  const badge: SetupPlan['badge'] = { status: github ? 'public-route' : 'unsupported-host', privateImageSupport: 'unverified' };
  const block = '<!-- agent-badge:start -->\n' + (github
    ? '[![AI usage](https://raw.githubusercontent.com/' + github.slice('https://github.com/'.length) + '/refs/heads/agent-badge/data/badge.svg)](' + github + '/tree/agent-badge/data)\n\n[data and coverage](' + github + '/tree/agent-badge/data).'
    : 'AI coding usage: data, coverage and badge.svg are recorded on refs/heads/agent-badge/data. Hosted image routing is unsupported for this destination.') + '\n<!-- agent-badge:end -->';
  const readmeBefore = await contents(join(repository.worktreeRoot, 'README.md'));
  const pattern = /<!-- agent-badge:start -->[\s\S]*?<!-- agent-badge:end -->/g;
  const matches = readmeBefore?.match(pattern) ?? [];
  if (matches.length > 1 || (readmeBefore?.includes('<!-- agent-badge:start -->') && matches.length !== 1)) throw new Error('Ambiguous managed README block.');
  const readme = matches.length ? readmeBefore!.replace(pattern, block) : (readmeBefore ?? '').replace(/\s*$/, '') + (readmeBefore ? '\n\n' : '') + block + '\n';
  const owned: Record<string, string> = { '.agent-badge/config.json': json(declaration), '.agent-badge/run.cjs': launcherSource,
    '.agent-badge/runtime/package.json': pin.manifest, '.agent-badge/runtime/package-lock.json': pin.lock,
    '.agent-badge/README.md': '# Agent Badge\n\nRequires Node 24 or 26 and npm. Each clone needs explicit activation:\n\n```sh\nnode .agent-badge/run.cjs setup\n```\n\nOnly local agent usage can be collected. CI cannot discover histories on another machine. Initial state may be queued or unavailable; see data and coverage on refs/heads/agent-badge/data. No measurement is a claim of complete coverage or a bill.\n',
    'README.md': readme };
  owned['.agent-badge/README.md'] += '\nFork origins that differ from the declaration collect locally with auto-sync unbound. Writers may explicitly select setup --target upstream. A standalone fork uses setup --new-repository --repository-url <fork-url> in a fresh clone without private Badge state, creating a new UUID. Existing remote ledgers with a different UUID are never overwritten.\n\nFork contributors run agent-badge contribute, then stage the generated .agent-badge/contributions/<digest>.json with their normal PR. This is an explicit normal-staging exception: contribute never stages or commits. Only accepted default-branch envelopes affect upstream; closed or unmerged PRs do not. Retain the immutable file until trusted import succeeds; retry import/reconciliation after offline or queued outcomes.\n';
  const priorOwnership = await contents(join(repository.worktreeRoot, '.agent-badge/ownership.json'));
  const ownership = priorOwnership ? JSON.parse(priorOwnership) : null;
  owned['.agent-badge/README.md'] += '\nGitHub setup constructs a fixed public badge.svg route linked to the data-branch report. Repository visibility is not probed. Public-route construction is supported; hosted/private authenticated image rendering remains unverified, and caches may show old images after confirmed sync. Other hosts have no inferred GitHub image route.\n';
  const workflowPath = '.github/workflows/agent-badge-import.yml';
  if (options.importWorkflow || (previous && previous.runtimeVersion !== runtimeVersion && ownership?.schemaVersion === 1 && ownership.files?.[workflowPath])) {
    const { planImportWorkflow } = await import('./workflow.js');
    owned['.github/workflows/agent-badge-import.yml'] = await planImportWorkflow(repository, binding, declaration, pin, options.readWorkflowRemoteHead);
  }
  const ownershipPath = '.agent-badge/ownership.json';
  owned['.agent-badge/README.md'] += '\nSetup installs a private pre-push delegate and shared Codex/Claude Stop and SubagentStop wakeups, plus a Gemini AfterModel wakeup. Existing user hook failures still block pushes. Legacy Agent Badge/Gist markers, shared hooksPath and self-dispatching hook managers require explicit local cleanup/integration; inspect setup action items.\n\nProvider hooks require Node 24 or 26 on the provider PATH plus explicit native project trust and hook review. Review .codex/hooks.json, .claude/settings.json and .gemini/settings.json in the provider, then restart it. Setup never grants native trust. On the inspected Codex source generation, linked worktrees load hooks from the primary checkout; review/setup that checkout explicitly when required. Worktree-local Codex config alone does not establish native hooks. Git hooks retain the approved Node executable for minimal GUI PATH. Windows automatic hooks are unsupported; use manual synchronization.\n\nAutomatic work has a two-second total budget and retains available local usage before transport. Pre-push streams refs to the existing hook immediately and only retains a bounded 1 MiB Badge copy until EOF. Open, oversized or expired input skips Badge while preserving the user hook lifetime and input. Incomplete capture remains pending for manual reconciliation. Provider payloads only route bounded local reads; they are never usage receipts. Claude historical JSONL numeric accounting is unsupported/unknown. Gemini saved-success coverage is partial: failed attempts can be absent, and AfterModel only wakes collection; it is never an independent receipt. Gemini exact model IDs remain unpriced. Fresh clones require explicit setup. An already activated common directory can reuse its approved private runtime from older branches without a tracked pin; a changed pin requires explicit setup.\n';
  for (const [path, after] of Object.entries(owned)) {
    const before = await contents(join(repository.worktreeRoot, path));
    if (path !== 'README.md' && before !== null && before !== after && (!ownership || ownership.schemaVersion !== 1 || ownership.files?.[path] !== digest(before))) {
      // Configuration is intentionally user editable, but launcher/pins must remain owned.
      if (path !== '.agent-badge/config.json') throw new Error('Owned setup file was modified; reconcile explicitly.');
    }
  }
  owned[ownershipPath] = json({ schemaVersion: 1, files: { ...(ownership?.schemaVersion === 1 && /^[a-f0-9]{64}$/.test(ownership.files?.[workflowPath]) ? { [workflowPath]: ownership.files[workflowPath] } : {}), ...Object.fromEntries(Object.entries(owned).filter(([p]) => p !== 'README.md').map(([p, value]) => [p, digest(value)])) }, readmeBlock: 'agent-badge' });
  const changes: OwnedChange[] = [];
  for (const [path, after] of Object.entries(owned)) { const before = await contents(join(repository.worktreeRoot, path)); if (before !== after) changes.push({ path, before, after }); }
  changes.push(...agentHooks.changes);
  return { badge, repository, declaration, pin, lockHash, activation, changes, initialize: activation.initializeAllowed,
    privateChanges: [`runtime/${lockHash}`, 'setup-intent.json', 'bootstrap.cjs', 'local.json', 'hooks.json', 'git-hook.cjs', 'agent-hooks.pending.json', 'integration-locks/', repository.hooksPath + '/pre-push'], options, hooks, agentHooks };
}
async function verifyRuntime(path: string, version: string) {
  const root = join(path, 'node_modules/@legotin/agent-badge');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (pkg.version !== version || !await contents(join(root, 'dist/cli/main.js')) || !await contents(join(root, 'dist/integration/runtime.js')) || !await contents(join(root, 'dist/integration/runtime-worker.js'))) throw new Error('Installed runtime version mismatch.');
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

  if (plan.initialize) {
    const intent = await loadSetupIntent(privateDir);
    if (intent && intent.repositoryId !== plan.declaration.repositoryId) throw new Error('Private setup intent identity mismatch.');
    await atomic(join(privateDir, 'setup-intent.json'), json({ schemaVersion: 1, repositoryId: plan.declaration.repositoryId, initializeAllowed: true }));
  }
  const agentFiles = new Set(plan.agentHooks.changes.map(c => c.path));
  for (const change of plan.changes) if (!agentFiles.has(change.path)) await atomic(join(plan.repository.worktreeRoot, change.path), change.after, 0o644);
  const agentHooks = await applyAgentHookPlan(plan.agentHooks);
  // Approval precedes switching executable entrypoints. A crash can leave an old approved
  // bootstrap, which fails its own runtime/pin check; it cannot start unapproved new code.
  await atomic(join(privateDir, 'local.json'), json(plan.activation));
  await atomic(join(privateDir, 'bootstrap.cjs'), bootstrapSource.replace('APPROVED_RUNTIME_HASH', plan.lockHash));
  const hooks = await applyHookPlan(plan.hooks);
  await rm(join(privateDir, 'setup-intent.json'), { force: true });
  const request: RepositoryOperationRequest = { cwd: plan.repository.worktreeRoot, privateDir, repositoryId: plan.declaration.repositoryId, binding: plan.activation.binding, collect: 'full', capturePolicy: plan.activation.capturePolicy,
    collection: { roots: plan.activation.roots, privatePolicy: plan.activation.privatePolicy } };
  if (plan.initialize) request.initialize = { meta: { schemaVersion: 2, protocolVersion: 1, repositoryId: plan.declaration.repositoryId, normalizationVersion: 1,
    catalogVersion: core.defaultCatalog.version, catalogHash: core.catalogHash(core.defaultCatalog), policy: plan.declaration.policy }, catalog: core.defaultCatalog };
  let operation: InitialResult;
  if (plan.options.runInitialOperation) operation = await plan.options.runInitialOperation(request);
  else { const { createOperationBudget } = await import('@legotin/agent-badge-core/operations/budget'); const { runRepositoryOperation } = await import('@legotin/agent-badge-core/operations/runner');
    const budget = createOperationBudget('manual', plan.options.timeoutMs ?? 120000); try { operation = await runRepositoryOperation({ request, budget }); } finally { budget.dispose(); } }
  return { status: operation.status, runtimeVersion: plan.declaration.runtimeVersion, installed, changedFiles: plan.changes.map(c => c.path), operation, hooks, agentHooks };
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

/** Explicit private attribution edit using the activation owner's atomic writer. */
export async function writePrivatePolicy(repository: RepositoryContext, before: Activation, privatePolicy: unknown, signal: AbortSignal): Promise<Activation> {
  const core = await import('@legotin/agent-badge-core');
  const next = { ...before, privatePolicy: core.parsePrivateAttributionPolicy(privatePolicy) };
  signal.throwIfAborted();
  if (JSON.stringify(await loadActivation(repository.privateDir)) !== JSON.stringify(before)) throw new Error('Private activation changed; retry explicit action.');
  if (Buffer.byteLength(json(next)) > 200 * 1024) throw new Error('Private activation exceeds supervised input limit.');
  await atomic(join(repository.privateDir,'local.json'),json(next));
  return next;
}
