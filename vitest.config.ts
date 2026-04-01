import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@legotin/agent-badge-core": `${rootDir}packages/core/src/index.ts`,
      "@agent-badge/core": `${rootDir}packages/core/src/index.ts`,
      "@agent-badge/testkit": `${rootDir}packages/testkit/src/index.ts`,
      "agent-badge": `${rootDir}packages/agent-badge/src/index.ts`
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "scripts/**/*.test.ts"],
    passWithNoTests: true
  }
});
