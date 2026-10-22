import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBareRemoteFixture, snapshotUserCheckout, type GitFixture } from "@agent-badge/testkit";
import { resolveRepository } from "./context.js";

describe("repository context", () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createBareRemoteFixture(); });
  afterEach(async () => { await fixture.cleanup(); });

  it("resolves subdirectories without modifying checkout, index or refs", async () => {
    const cwd = fixture.clones[0];
    await mkdir(join(cwd, "spaces ü", "nested"), { recursive: true });
    await writeFile(join(cwd, "tracked.txt"), "synthetic staged edit\n");
    await fixture.git(cwd, ["add", "tracked.txt"]);
    await writeFile(join(cwd, "tracked.txt"), "synthetic unstaged edit\n");
    await writeFile(join(cwd, "untracked.txt"), "synthetic untracked edit\n");
    const before = await snapshotUserCheckout(cwd);
    const ctx = await resolveRepository(join(cwd, "spaces ü", "nested"));
    expect(ctx.worktreeRoot).toBe(await realpath(cwd));
    expect(ctx.gitDir).toBe(join(await realpath(cwd), ".git"));
    expect(ctx.commonDir).toBe(ctx.gitDir);
    expect(ctx.hooksPath).toBe(join(ctx.gitDir, "hooks"));
    expect(ctx.privateDir).toBe(join(ctx.commonDir, "agent-badge"));
    expect(ctx.superprojectRoot).toBeNull();
    expect(await snapshotUserCheckout(cwd)).toEqual(before);
  });

  it("shares the common directory across linked worktrees and retains prunable mappings", async () => {
    const linked = join(fixture.root, "linked ü");
    await fixture.git(fixture.clones[0], ["worktree", "add", "-b", "linked", linked]);
    const ctx = await resolveRepository(linked);
    expect(ctx.gitDir).not.toBe(ctx.commonDir);
    expect(ctx.commonDir).toBe(join(await realpath(fixture.clones[0]), ".git"));
    await rm(linked, { recursive: true });
    const main = await resolveRepository(fixture.clones[0]);
    expect(main.worktrees.find(w => w.path === linked)).toMatchObject({ prunable: true });
  });

  it("finds nested repository and submodule boundaries", async () => {
    const nested = join(fixture.clones[0], "nested");
    await mkdir(nested);
    await fixture.git(nested, ["init", "--initial-branch=main"]);
    expect((await resolveRepository(nested)).worktreeRoot).toBe(nested);
    await fixture.git(fixture.clones[0], ["-c", "protocol.file.allow=always", "submodule", "add", fixture.remote, "module"]);
    const module = await resolveRepository(join(fixture.clones[0], "module"));
    expect(module.superprojectRoot).toBe(fixture.clones[0]);
    expect(module.commonDir).not.toBe((await resolveRepository(fixture.clones[0])).commonDir);
  });

  it("resolves separate git dirs and relative and absolute hooksPath", async () => {
    const cwd = join(fixture.root, "separate ü");
    const gitDir = join(fixture.root, "metadata");
    await fixture.git(fixture.root, ["init", "--separate-git-dir", gitDir, cwd]);
    await fixture.git(cwd, ["config", "core.hooksPath", "custom hooks"]);
    expect(await resolveRepository(cwd)).toMatchObject({ gitDir, commonDir: gitDir, hooksPath: join(cwd, "custom hooks") });
    await fixture.git(cwd, ["config", "core.hooksPath", join(fixture.root, "absolute hooks")]);
    expect((await resolveRepository(cwd)).hooksPath).toBe(join(fixture.root, "absolute hooks"));
  });

  it("supports detached, unborn and shallow repositories", async () => {
    await fixture.git(fixture.clones[0], ["checkout", "--detach"]);
    expect((await resolveRepository(fixture.clones[0])).head).toMatchObject({ kind: "detached" });
    const unborn = join(fixture.root, "unborn");
    await fixture.git(fixture.root, ["init", "--initial-branch=main", unborn]);
    expect((await resolveRepository(unborn)).head).toEqual({ kind: "unborn", ref: "refs/heads/main" });
    const shallow = join(fixture.root, "shallow");
    await fixture.git(fixture.root, ["clone", "--depth=1", `file://${fixture.remote}`, shallow]);
    expect((await resolveRepository(shallow)).shallow).toBe(true);
  });

  it("does not follow inherited Git directory overrides", async () => {
    const before = process.env.GIT_DIR;
    process.env.GIT_DIR = join(fixture.clones[1], ".git");
    try { expect((await resolveRepository(fixture.clones[0])).worktreeRoot).toBe(fixture.clones[0]); }
    finally { if (before === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = before; }
  });

  it("respects the effective global hooks policy while isolating repository overrides", async () => {
    const config = join(fixture.root, "global-config");
    await writeFile(config, "[core]\n hooksPath = global-hooks\n");
    const before = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = config;
    try { expect((await resolveRepository(fixture.clones[0])).hooksPath).toBe(join(fixture.clones[0], "global-hooks")); }
    finally { if (before === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = before; }
  });

  it("rejects non-repositories with a path-free error", async () => {
    await writeFile(join(fixture.root, "untracked"), "synthetic");
    await expect(resolveRepository(fixture.root)).rejects.toThrow("Unable to resolve repository");
  });
});
