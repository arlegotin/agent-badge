/** One option contract shared by Commander and the generated bootstrap parser. */
export const setupOptions = [
  ['--new-repository', 'Create a standalone UUID in a fresh clone without private Badge state.'],
  ['--target <remote>', 'Explicitly approve a Git remote destination.'],
  ['--repository-url <url>', 'Credential-free repository declaration URL.'],
  ['--runtime-version <version>', 'Exact runtime version.'],
  ['--dry-run', 'Print a plan without applying.'],
  ['--import-workflow', 'Generate trusted accepted-contribution import workflow.'],
  ['--json', 'Print stable JSON.'],
] as const;
