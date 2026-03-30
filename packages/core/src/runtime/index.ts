export interface RuntimeModule {
  readonly packageName: "agent-badge";
  readonly entrypoint: "dist/cli/main.js";
}

export function createRuntimeModule(): RuntimeModule {
  return {
    packageName: "agent-badge",
    entrypoint: "dist/cli/main.js"
  };
}
