import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBareRemoteFixture, type GitFixture } from "@agent-badge/testkit";
import { runGit } from "./process.js";

describe("bounded Git subprocess", () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createBareRemoteFixture(); });
  afterEach(async () => { await fixture.cleanup(); });
  async function command(source: string): Promise<string[]> {
    const bin = join(fixture.root, "bin");
    await mkdir(bin);
    const file = join(bin, "git-synthetic");
    const script = join(bin, "synthetic.cjs");
    await writeFile(script, source);
    const quote = (value: string): string => `'${value.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
    await writeFile(file, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(script)} "$@"\n`);
    await chmod(file, 0o755);
    return [`--exec-path=${bin}`, "synthetic"];
  }

  it("passes hostile arguments literally without a shell", async () => {
    const args = await command("process.stdout.write(JSON.stringify(process.argv.slice(2)))");
    const result = await runGit([...args, "--hostile", "$(touch never)", "; echo bad"], { cwd: fixture.root });
    expect(result.status).toBe("ok");
    expect(JSON.parse(result.stdout)).toEqual(["--hostile", "$(touch never)", "; echo bad"]);
  });

  it("bounds output and redacts credentials, local paths and supplied secrets in diagnostics", async () => {
    const args = await command("process.stderr.write('https://alice:password@example.invalid/team/repo /private/synthetic secret-token\\n' + 'x'.repeat(5000))");
    const result = await runGit(args, { cwd: fixture.root, maxOutputBytes: 512, redact: ["secret-token"] });
    expect(result.status).toBe("output-limit");
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(512);
    expect(result.stderr).not.toMatch(/alice|password|private\/synthetic|secret-token/);
  });

  it("redacts URL credentials even when the output cap cuts off the authority", async () => {
    const args = await command("process.stderr.write('https://alice:password@' + 'x'.repeat(5000))");
    const result = await runGit(args, { cwd: fixture.root, maxOutputBytes: 19 });
    expect(result.status).toBe("output-limit");
    expect(result.stderr).not.toMatch(/alice|pass/);
  });

  it("preserves UTF-8 diagnostic bounds without replacement characters", async () => {
    const args = await command("process.stderr.write('ü'.repeat(100))");
    const result = await runGit(args, { cwd: fixture.root, maxOutputBytes: 7 });
    expect(result.status).toBe("output-limit");
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(7);
    expect(result.stderr).not.toContain("�");
  });

  it("redacts local paths containing spaces and Windows path separators", async () => {
    const args = await command("process.stderr.write('fatal: /private/synthetic path/secret.ts: denied\\nfatal: C:\\\\synthetic path\\\\secret.ts: denied\\n')");
    const result = await runGit(args, { cwd: fixture.root });
    expect(result.status).toBe("ok");
    expect(result.stderr).not.toMatch(/private|synthetic|secret\.ts/);
    expect(result.stderr).toContain("fatal:");
  });

  it.skipIf(process.platform === "win32")("times out and kills descendants even when the direct process exits", async () => {
    const pidFile = join(fixture.root, "pid");
    const args = await command(`const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit']}); require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(child.pid)); process.exit(0);`);
    const result = await runGit(args, { cwd: fixture.root, timeoutMs: 1500 });
    expect(result.status).toBe("timeout");
    const pid = Number(await readFile(pidFile, "utf8"));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("honors AbortSignal and skips an already aborted invocation", async () => {
    const controller = new AbortController();
    const args = await command("setInterval(()=>{},1000)");
    const pending = runGit(args, { cwd: fixture.root, signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    expect((await pending).status).toBe("aborted");
    expect((await runGit(["--version"], { cwd: fixture.root, signal: controller.signal })).status).toBe("aborted");
  });

  it("isolates an index override from the user's index", async () => {
    const cwd = fixture.clones[0];
    const index = await readFile(join(cwd, ".git/index"));
    expect((await runGit(["read-tree", "--empty"], { cwd, indexFile: join(fixture.root, "private-index") })).status).toBe("ok");
    expect(await readFile(join(cwd, ".git/index"))).toEqual(index);
  });
});
