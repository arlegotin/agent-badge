import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
/** Synthetic pinned saved history. Paths/IDs are private test evidence only. */
export async function geminiSavedSession(cwd = "/synthetic/repo") {
  const bytes = await readFile(
    new URL("../fixtures/gemini/session-success.jsonl", import.meta.url),
    "utf8"
  );
  return bytes.replaceAll(
    "PROJECT_HASH",
    createHash("sha256").update(cwd).digest("hex")
  );
}
export async function createGeminiFixtureHome(cwd = "/synthetic/repo") {
  const root = await mkdtemp("/private/tmp/agent-badge-gemini-fixture-");
  const chats = join(root, "tmp", "synthetic-project", "chats"),
    path = join(chats, "session-synthetic.jsonl");
  await mkdir(chats, { recursive: true });
  await writeFile(
    join(root, "projects.json"),
    JSON.stringify({ projects: { [cwd]: "synthetic-project" } })
  );
  await writeFile(path, await geminiSavedSession(cwd));
  return {
    root,
    path,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
