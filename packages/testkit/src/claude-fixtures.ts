import { cp } from "node:fs/promises";
import { join } from "node:path";

import {
  createProviderFixture,
  type ProviderFixture
} from "./provider-fixtures.js";

const fixtureRoot = new URL("../fixtures/claude/projects/", import.meta.url);

export async function createClaudeFixtureHome(): Promise<ProviderFixture> {
  const fixture = await createProviderFixture({ codex: false });

  if (fixture.claudeRoot === null) {
    throw new Error("Claude fixture root was not created.");
  }

  await cp(fixtureRoot, join(fixture.claudeRoot, "projects"), { recursive: true });

  return fixture;
}
