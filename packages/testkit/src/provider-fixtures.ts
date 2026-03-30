export interface ProviderFixtureRoots {
  readonly codexRoot: string;
  readonly claudeRoot: string;
}

export function createProviderFixtureRoots(
  codexRoot: string,
  claudeRoot: string
): ProviderFixtureRoots {
  return {
    codexRoot,
    claudeRoot
  };
}
