import { readFile } from 'node:fs/promises';
import { repositoryIdSchema, ProtocolError } from '../domain/capabilities.js';
export interface ContributionWorkflowOptions {
  repositoryId: string;
  repositoryUrl: string;
  /** Actual destination default branch, discovered by setup; never assume main. */
  defaultBranch: string;
  runtimeVersion: string;
  /** Exact approved release pin, embedded into workflow rather than loaded from the checkout. */
  pin: { manifest: string; lock: string };
  /** Explicit opt-in only; five bounded cron fields. */
  schedule?: string;
}
/** GitHub's five numeric POSIX fields: lists, inclusive ranges and positive steps. */
function validSchedule(schedule: string): boolean {
  if (schedule.length > 256) return false;
  const fields = schedule.split(' '), ranges = [[0,59],[0,23],[1,31],[1,12],[0,6]];
  return fields.length === 5 && fields.every((field, index) => {
    const [min,max] = ranges[index];
    return field.split(',').every(part => {
      const match = /^(\*|\d{1,2})(?:-(\d{1,2}))?(?:\/(\d{1,2}))?$/.exec(part);
      if (!match || (match[1] === '*' && match[2])) return false;
      const start = match[1] === '*' ? min : Number(match[1]);
      const end = match[2] === undefined ? (match[1] === '*' ? max : start) : Number(match[2]);
      return start >= min && end <= max && start <= end &&
        (match[3] === undefined || (Number(match[3]) > 0 && Number(match[3]) <= max - min + 1));
    });
  });
}
/** Generate reviewable trusted default-branch import. No installation, write or hosted mutation. */
export async function generateContributionWorkflow(options: ContributionWorkflowOptions): Promise<string> {
  try {
    if (!repositoryIdSchema.safeParse(options.repositoryId).success ||
        !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repositoryUrl) ||
        !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(options.defaultBranch) || /\.\.|\/\/|\/$|\.$|\.lock(?:\/|$)/.test(options.defaultBranch) ||
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(options.runtimeVersion) ||
        (options.schedule !== undefined && !validSchedule(options.schedule))) throw new Error();
    if (Buffer.byteLength(options.pin.manifest) > 32768 || Buffer.byteLength(options.pin.lock) > 256 * 1024) throw new Error();
    const manifest = JSON.parse(options.pin.manifest), lock = JSON.parse(options.pin.lock);
    if (manifest.private !== true || JSON.stringify(Object.keys(manifest.dependencies ?? {})) !== '["@legotin/agent-badge"]' ||
        manifest.dependencies['@legotin/agent-badge'] !== options.runtimeVersion || lock.lockfileVersion !== 3 ||
        lock.packages?.['']?.dependencies?.['@legotin/agent-badge'] !== options.runtimeVersion ||
        lock.packages?.['node_modules/@legotin/agent-badge']?.version !== options.runtimeVersion) throw new Error();
    for (const [path, entry] of Object.entries(lock.packages) as [string, { version: string; resolved: string; integrity: string; link?: boolean }][]) {
      if (path === '') continue;
      if (entry.link || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry.version) ||
          !/^https:\/\/registry\.npmjs\.org\/[A-Za-z0-9@_./%+-]+$/.test(entry.resolved) ||
          !/^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity)) throw new Error();
    }
    const template = await readFile(new URL('../../resources/workflows/agent-badge-import.yml', import.meta.url), 'utf8');
    const values: Record<string, string> = {
      DEFAULT_BRANCH_JSON: JSON.stringify(options.defaultBranch), DEFAULT_REF_JSON: JSON.stringify(`refs/heads/${options.defaultBranch}`),
      DEFAULT_REF_EXPRESSION: `'refs/heads/${options.defaultBranch}'`,
      REPOSITORY_ID_JSON: JSON.stringify(options.repositoryId), REPOSITORY_URL_JSON: JSON.stringify(options.repositoryUrl),
      MANIFEST_BASE64: Buffer.from(options.pin.manifest).toString('base64'), LOCK_BASE64: Buffer.from(options.pin.lock).toString('base64'),
      SCHEDULE: options.schedule ? `  schedule:\n    - cron: ${JSON.stringify(options.schedule)}` : '',
    };
    const workflow = template.replace(/__([A-Z0-9_]+)__/g, (_, key: string) => values[key]);
    if (Buffer.byteLength(workflow, 'utf8') > 500000) throw new ProtocolError('object-too-large');
    return workflow;
  } catch (error) { if (error instanceof ProtocolError) throw error; throw new ProtocolError('invalid-record'); }
}
