import { existsSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

export const packageManagerSchema = z.enum(["npm", "pnpm", "yarn", "bun"]);

export type PackageManager = z.infer<typeof packageManagerSchema>;

const lockfileDetectionOrder: Array<{
  packageManager: PackageManager;
  lockfile: string;
}> = [
  { packageManager: "pnpm", lockfile: "pnpm-lock.yaml" },
  { packageManager: "yarn", lockfile: "yarn.lock" },
  { packageManager: "bun", lockfile: "bun.lockb" },
  { packageManager: "bun", lockfile: "bun.lock" },
  { packageManager: "npm", lockfile: "package-lock.json" },
  { packageManager: "npm", lockfile: "npm-shrinkwrap.json" }
];

export function detectPackageManager(projectRoot: string): PackageManager {
  for (const { packageManager, lockfile } of lockfileDetectionOrder) {
    if (existsSync(join(projectRoot, lockfile))) {
      return packageManager;
    }
  }

  return "npm";
}
