import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createProviderFixture,
  type ProviderFixture
} from "./provider-fixtures.js";

const sqliteModuleName = "better-sqlite3";
const fixtureRoot = new URL("../fixtures/codex/", import.meta.url);

async function materializeCodexDatabase(
  sqlPath: string,
  dbPath: string
): Promise<void> {
  const sql = await readFile(sqlPath, "utf8");
  const sqliteModule = (await import(sqliteModuleName)) as {
    default: new (path: string) => { exec(statement: string): void; close(): void };
  };
  const database = new sqliteModule.default(dbPath);

  try {
    database.exec(sql);
  } finally {
    database.close();
  }
}

export async function createCodexFixtureHome(): Promise<ProviderFixture> {
  const fixture = await createProviderFixture({ claude: false });

  if (fixture.codexRoot === null) {
    throw new Error("Codex fixture root was not created.");
  }

  const sqlPath = new URL("state-5.sql", fixtureRoot);
  const historyPath = new URL("history.jsonl", fixtureRoot);

  await materializeCodexDatabase(
    sqlPath.pathname,
    join(fixture.codexRoot, "state_5.sqlite")
  );
  await copyFile(historyPath.pathname, join(fixture.codexRoot, "history.jsonl"));

  return fixture;
}
