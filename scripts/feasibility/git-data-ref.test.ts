import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createBareRemoteFixture, snapshotUserCheckout, type GitFixture } from "@agent-badge/testkit";
import { describe, expect, it } from "vitest";

const dataRef = "refs/heads/agent-badge/data";

// Plumbing creates data objects without a checkout, temporary index, or code ref.
async function dataCommit(fixture: GitFixture, cwd: string, records: string[], parent?: string) {
  const blob = await fixture.git(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(records)}\n`);
  const tree = await fixture.git(cwd, ["mktree"], `100644 blob ${blob.trim()}\trecords.json\n`);
  return (await fixture.git(cwd, ["commit-tree", tree.trim(), ...(parent ? ["-p", parent] : [])], "Update aggregate usage\n")).trim();
}

async function dirtyCheckout(fixture: GitFixture, cwd: string) {
  await writeFile(join(cwd, "tracked.txt"), "staged synthetic change\n");
  await fixture.git(cwd, ["add", "tracked.txt"]);
  await writeFile(join(cwd, "tracked.txt"), "unstaged synthetic change\n");
  await writeFile(join(cwd, "untracked.txt"), "untracked synthetic change\n");
}

describe("data branch Git feasibility", () => {
  it("snapshots HEAD, index bytes, refs and dirty file contents independently", async () => {
    const fixture = await createBareRemoteFixture();
    try {
      const [cwd] = fixture.clones;
      await dirtyCheckout(fixture, cwd);
      const snapshot = await snapshotUserCheckout(cwd);
      expect(snapshot.head).toMatch(/^[a-f0-9]{40,64}$/);
      expect(snapshot.headRef).toBe("refs/heads/main");
      expect(snapshot.index).toBe((await readFile(join(cwd, ".git", "index"))).toString("hex"));
      expect(snapshot.refs).toContain("refs/heads/main ");
      expect(snapshot.refs).toContain("refs/stash ");
      expect(snapshot.files["tracked.txt"]?.content).toBe(Buffer.from("unstaged synthetic change\n").toString("hex"));
      expect(snapshot.files["untracked.txt"]?.content).toBe(Buffer.from("untracked synthetic change\n").toString("hex"));
      await writeFile(join(cwd, "untracked.txt"), "changed\n");
      expect(await snapshotUserCheckout(cwd)).not.toEqual(snapshot);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects the second sibling push and retains both records after rebuilding on the new tip", async () => {
    const fixture = await createBareRemoteFixture();
    try {
      const [alice, bob] = fixture.clones;
      await dirtyCheckout(fixture, alice);
      await dirtyCheckout(fixture, bob);
      const initial = await dataCommit(fixture, alice, []);
      await fixture.git(alice, ["push", "origin", `${initial}:${dataRef}`]);
      await fixture.git(bob, ["fetch", "origin", dataRef]);
      const beforeAlice = await snapshotUserCheckout(alice);
      const beforeBob = await snapshotUserCheckout(bob);
      const first = await dataCommit(fixture, alice, ["contributor-a"], initial);
      const second = await dataCommit(fixture, bob, ["contributor-b"], initial);
      await fixture.git(alice, ["push", "origin", `${first}:${dataRef}`]);
      await expect(fixture.git(bob, ["push", "origin", `${second}:${dataRef}`])).rejects.toThrow(/rejected|fetch first|non-fast-forward/);
      await fixture.git(bob, ["fetch", "origin", dataRef]);
      const newParent = (await fixture.git(bob, ["rev-parse", "FETCH_HEAD"])).trim();
      expect(newParent).toBe(first);
      const retained = JSON.parse(await fixture.git(bob, ["show", `${newParent}:records.json`])) as string[];
      const rebuilt = await dataCommit(fixture, bob, [...retained, "contributor-b"], newParent);
      await fixture.git(bob, ["push", "origin", `${rebuilt}:${dataRef}`]);
      expect(JSON.parse(await fixture.git(fixture.remote, ["show", `${dataRef}:records.json`]))).toEqual(["contributor-a", "contributor-b"]);
      expect((await fixture.git(fixture.remote, ["rev-parse", `${dataRef}^`])).trim()).toBe(first);
      expect(await snapshotUserCheckout(alice)).toEqual(beforeAlice);
      expect(await snapshotUserCheckout(bob)).toEqual(beforeBob);
      const metadata = await fixture.git(fixture.remote, ["show", "--no-patch", "--format=%an%n%ae%n%cn%n%ce%n%B", dataRef]);
      expect(metadata).toBe("agent-badge fixture\nfixture@example.invalid\nagent-badge fixture\nfixture@example.invalid\nUpdate aggregate usage\n\n");
    } finally {
      await fixture.cleanup();
    }
  });

  it("pushes data from a real pre-push hook once without altering the dirty checkout", async () => {
    const fixture = await createBareRemoteFixture();
    try {
      const [cwd] = fixture.clones;
      await writeFile(join(cwd, "tracked.txt"), "code to push\n");
      await fixture.git(cwd, ["add", "tracked.txt"]);
      await fixture.git(cwd, ["commit", "-m", "Synthetic code update"]);
      await dirtyCheckout(fixture, cwd);
      const commit = await dataCommit(fixture, cwd, ["hook-contributor"]);
      const hook = join(cwd, ".git", "hooks", "pre-push");
      await writeFile(hook, `#!/bin/sh\nset -eu\nprintf 'invoked\\n' >> .git/hook-invocations\n# A second invocation fails immediately rather than recursing indefinitely.\n[ "$(wc -l < .git/hook-invocations | tr -d ' ')" = 1 ]\ncat > .git/hook-input\ngit -c core.hooksPath=/dev/null push origin '${commit}:${dataRef}'\n`);
      await chmod(hook, 0o755);
      const before = await snapshotUserCheckout(cwd);
      await fixture.git(cwd, ["push", "origin", "HEAD:refs/heads/main"]);
      expect(await readFile(join(cwd, ".git", "hook-invocations"), "utf8")).toBe("invoked\n");
      expect(await readFile(join(cwd, ".git", "hook-input"), "utf8")).toContain("refs/heads/main");
      expect((await fixture.git(fixture.remote, ["rev-parse", dataRef])).trim()).toBe(commit);
      expect((await fixture.git(fixture.remote, ["rev-parse", "refs/heads/main"])).trim()).toBe(before.head);
      expect(await snapshotUserCheckout(cwd)).toEqual(before);
    } finally {
      await fixture.cleanup();
    }
  });
});
