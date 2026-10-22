import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createBareRemoteFixture, snapshotUserCheckout, type GitFixture } from "@agent-badge/testkit";
import { resolveRepository, type RepositoryContext } from "./context.js";
import { bindRemote, canonicalRemoteUrl, verifyBinding } from "./remote-binding.js";

const repositoryId = "4ee2d92a-73f9-421a-b35c-f01c11de97dc";
const declaredUrl = "https://github.com/team/repo.git";
describe("private routing consent", () => {
  let fixture: GitFixture;
  let ctx: RepositoryContext;
  beforeEach(async () => {
    fixture = await createBareRemoteFixture();
    await fixture.git(fixture.clones[0], ["remote", "set-url", "origin", declaredUrl]);
    ctx = await resolveRepository(fixture.clones[0]);
  });
  afterEach(async () => { await fixture.cleanup(); });
  const request = { repositoryId, declaredUrl };

  it("binds matching origin routing without claiming remote ledger validation", async () => {
    const before = await snapshotUserCheckout(ctx.worktreeRoot);
    const binding = await bindRemote(ctx, request);
    expect(binding).toMatchObject({ status: "bound", remoteName: "origin", repositoryId, dataRef: "refs/heads/agent-badge/data", ledgerEvidence: null });
    expect(await verifyBinding(ctx, binding)).toEqual({ status: "valid" });
    expect(await snapshotUserCheckout(ctx.worktreeRoot)).toEqual(before);
  });

  it("does not inherit upstream consent through a fork origin", async () => {
    await fixture.git(ctx.worktreeRoot, ["remote", "set-url", "origin", "https://example.invalid/fork/repo.git"]);
    await fixture.git(ctx.worktreeRoot, ["remote", "add", "upstream", declaredUrl]);
    expect(await bindRemote(ctx, request)).toMatchObject({ status: "unbound", reason: "destination-mismatch" });
    expect(await bindRemote(ctx, { ...request, target: "upstream" })).toMatchObject({ status: "bound", remoteName: "upstream" });
  });

  it("suspends consent on changed fetch or push URLs and multiple push URLs", async () => {
    const binding = await bindRemote(ctx, request);
    await fixture.git(ctx.worktreeRoot, ["remote", "set-url", "--push", "origin", "https://example.invalid/elsewhere/repo"]);
    expect(await verifyBinding(ctx, binding)).toMatchObject({ status: "suspended", reason: "routing-changed" });
    await fixture.git(ctx.worktreeRoot, ["remote", "set-url", "--add", "--push", "origin", declaredUrl]);
    expect(await verifyBinding(ctx, binding)).toMatchObject({ status: "suspended", reason: "multiple-push-urls" });
    expect(await bindRemote(ctx, request)).toMatchObject({ status: "unbound", reason: "multiple-push-urls" });
  });

  it("rejects mismatching verified UUID and evidence for another destination", async () => {
    const ledgerEvidence = { repositoryId: "8fc53d67-3ee8-426c-96c3-cb6c56e6e9ea", canonicalPushUrl: "github.com/team/repo", dataRef: "refs/heads/agent-badge/data" };
    expect(await bindRemote(ctx, { ...request, ledgerEvidence })).toMatchObject({ status: "rejected", reason: "repository-id-mismatch" });
    expect(await bindRemote(ctx, { ...request, ledgerEvidence: { ...ledgerEvidence, repositoryId, canonicalPushUrl: "example.invalid/another/repo" } })).toMatchObject({ status: "rejected", reason: "evidence-destination-mismatch" });
  });

  it("keeps private stored consent independent of branch declarations", async () => {
    const binding = await bindRemote(ctx, request);
    await mkdir(join(ctx.worktreeRoot, ".agent-badge"));
    await writeFile(join(ctx.worktreeRoot, ".agent-badge/config.json"), JSON.stringify({ repositoryId, declaredUrl: "https://example.invalid/new/repo" }));
    expect(await verifyBinding(ctx, binding)).toEqual({ status: "valid" });
    await fixture.git(ctx.worktreeRoot, ["remote", "set-url", "origin", "https://example.invalid/new/repo"]);
    expect(await verifyBinding(ctx, binding)).toMatchObject({ status: "suspended" });
  });

  it("suspends changed fetch URLs even with an unchanged explicit push URL", async () => {
    await fixture.git(ctx.worktreeRoot, ["remote", "set-url", "--push", "origin", declaredUrl]);
    const binding = await bindRemote(ctx, request);
    await fixture.git(ctx.worktreeRoot, ["remote", "set-url", "origin", "https://example.invalid/fork/repo"]);
    expect(await verifyBinding(ctx, binding)).toMatchObject({ status: "suspended", reason: "routing-changed" });
  });

  it("retains verified evidence and checks stored evidence again", async () => {
    const ledgerEvidence = { repositoryId, canonicalPushUrl: "github.com/team/repo", dataRef: "refs/heads/agent-badge/data" };
    const binding = await bindRemote(ctx, { ...request, ledgerEvidence });
    expect(binding).toMatchObject({ status: "bound", ledgerEvidence });
    if (binding.status !== "bound") throw new Error("Expected bound routing");
    expect(await verifyBinding(ctx, { ...binding, ledgerEvidence: { ...ledgerEvidence, repositoryId: "wrong" } })).toMatchObject({ status: "suspended", reason: "repository-id-mismatch" });
    expect(await verifyBinding(ctx, { ...binding, dataRef: "refs/heads/code" as typeof binding.dataRef })).toMatchObject({ status: "suspended", reason: "invalid-request" });
  });

  it("rejects option-shaped remote names without invoking Git option parsing", async () => {
    expect(await bindRemote(ctx, { ...request, target: "--help" })).toMatchObject({ status: "rejected", reason: "invalid-request" });
  });

  it("binds explicitly declared native local remotes without network or credential access", async () => {
    await fixture.git(ctx.worktreeRoot, ["remote", "set-url", "origin", fixture.remote]);
    const binding = await bindRemote(ctx, { ...request, declaredUrl: fixture.remote });
    expect(binding).toMatchObject({ status: "bound", canonicalPushUrl: pathToFileURL(fixture.remote).href });
    expect(await verifyBinding(ctx, binding)).toEqual({ status: "valid" });
  });

  it("preserves spaces at the end of native local routing paths", async () => {
    const local = join(fixture.root, "remote with spaces ");
    await fixture.git(ctx.worktreeRoot, ["remote", "set-url", "origin", local]);
    expect(await bindRemote(ctx, { ...request, declaredUrl: local })).toMatchObject({ status: "bound", canonicalPushUrl: pathToFileURL(local).href });
  });
});

describe("canonical remote destination", () => {
  it.each([
    ["https://user:secret@GITHUB.com/team/repo.git", "github.com/team/repo"],
    ["git@github.com:team/repo.git", "github.com/team/repo"],
    ["ssh://git@github.com/team/repo.git", "github.com/team/repo"],
    ["https://example.invalid/a/repo.git", "https://example.invalid/a/repo.git"],
    ["https://example.invalid/b/repo.git", "https://example.invalid/b/repo.git"],
    ["https://example.invalid/Team/Repo.git", "https://example.invalid/Team/Repo.git"],
    ["ssh://git@example.invalid:2222/team/repo.git", "ssh://git@example.invalid:2222/team/repo.git"],
    ["ssh://git@example.invalid/~/team/repo.git", "ssh://git@example.invalid/~/team/repo.git"],
    ["git@example.invalid:team/repo.git", "ssh-home://git@example.invalid/team/repo.git"],
    ["git@example.invalid:/team/repo.git", "ssh://git@example.invalid/team/repo.git"],
    ["other@example.invalid:team/repo.git", "ssh-home://other@example.invalid/team/repo.git"],
    ["ssh://git@example.invalid/team/repo.git", "ssh://git@example.invalid/team/repo.git"],
    ["https://alice:secret@example.invalid/team/repo", "https://example.invalid/team/repo"],
    ["https://example.invalid/team/repo", "https://example.invalid/team/repo"]
  ])("normalizes %s without credentials or losing path identity", (url, want) => { expect(canonicalRemoteUrl(url)).toBe(want); });
  it.each(["ext::evil", "file://other-host/private/repo", "ssh://git:secret@example.invalid/repo", "--evil", "https://example.invalid/a/../b", "https://example.invalid/team/repo?token=secret", "https://example.invalid/a%2fb"]) ("rejects unsafe or ambiguous routing %s", url => { expect(canonicalRemoteUrl(url)).toBeNull(); });
  it("resolves relative local remotes only with an explicit repository base", () => {
    const base = process.platform === "win32" ? "C:\\synthetic\\checkout" : "/private/synthetic/checkout";
    const want = process.platform === "win32" ? "file:///C:/synthetic/remote.git" : "file:///private/synthetic/remote.git";
    expect(canonicalRemoteUrl("../remote.git", base)).toBe(want);
    expect(canonicalRemoteUrl("../remote.git")).toBeNull();
  });
  it("does not equate plaintext HTTP with HTTPS or generic .git suffix paths", () => {
    expect(canonicalRemoteUrl("http://github.com/team/repo.git")).toBe("http://github.com/team/repo.git");
    expect(canonicalRemoteUrl("https://example.invalid/team/repo")).toBe("https://example.invalid/team/repo");
  });
});
