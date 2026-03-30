export interface InitModule {
  readonly status: "placeholder";
  readonly command: "init";
}

export function createInitModule(): InitModule {
  return {
    status: "placeholder",
    command: "init"
  };
}
