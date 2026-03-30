export interface RepoFixture {
  readonly root: string;
  readonly readmePath: string;
}

export function createRepoFixture(root: string, readmePath = `${root}/README.md`): RepoFixture {
  return {
    root,
    readmePath
  };
}
