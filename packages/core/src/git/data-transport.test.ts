import { afterEach, expect, test, vi } from "vitest";
import * as processPort from './process.js';
import { access, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import {
  createBareRemoteFixture,
  startFixtureGitDaemon,
  commitFixtureTree,
  protocolObservationFixture,
} from "@agent-badge/testkit";
import type { GitFixture } from "@agent-badge/testkit";
import { resolveRepository } from "./context.js";
import { bindRemote } from "./remote-binding.js";
import { openStore } from "../storage/store.js";
import { catalogHash, defaultCatalog } from "../pricing/catalog.js";
import { renderArtifacts } from "../render/summary.js";
import { reduceLedger } from "../ledger/reduce.js";
import { DataTransport } from "./data-transport.js";
import { sanitizeObservation } from '../ledger/sanitize.js';
import { AcceptedIndex } from '../storage/accepted-index.js';
const repositoryId = "12345678-1234-4234-8234-123456789abc";
const meta = {
  schemaVersion: 2 as const,
  protocolVersion: 1 as const,
  repositoryId,
  normalizationVersion: 1 as const,
  catalogVersion: 1,
  catalogHash: catalogHash(defaultCatalog),
  policy: {
    schemaVersion: 1 as const,
    repositoryId,
    normalizationVersion: 1 as const,
    discovery: "auto" as const,
    disabledProviders: [],
    badge: { label: "AI usage", metric: "tokens" as const },
  },
};
const fixtures: GitFixture[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
});
async function fixture() {
  const f = await createBareRemoteFixture();
  fixtures.push(f);
  return f;
}
async function transport(f: GitFixture) {
  const repository = await resolveRepository(f.clones[0]);
  await openStore(repository);
  const binding = await bindRemote(repository, {
    repositoryId,
    declaredUrl: f.remote,
    target: "origin",
  });
  if (binding.status !== "bound") throw Error("fixture");
  return DataTransport.open({
    repository,
    binding,
    signal: AbortSignal.timeout(10000),
    deadline: Date.now() + 10000,
  });
}
const entries = () =>
  [...renderArtifacts(reduceLedger([], meta), meta, defaultCatalog)].map(
    ([path, bytes]) => ({ path, content: Buffer.from(bytes).toString("utf8") })
  );
test.each(['path','file-url','relative','rewritten'])('automatic %s publication refuses before starting a local receiver; explicit manual push remains available',async kind=>{
  const f=await fixture(),cwd=f.clones[0],marker=join(f.root,'receiver-started');
  let url=f.remote;
  if(kind==='file-url')url=pathToFileURL(f.remote).href;
  if(kind==='relative')url='../remote.git';
  if(kind==='rewritten'){
    url='https://synthetic.invalid/fixture';
    await f.git(cwd,['config',`url.${f.remote}.insteadOf`,url]);
  }
  await f.git(cwd,['remote','set-url','origin',url]);
  await writeFile(join(f.remote,'hooks/pre-receive'),`#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'started');\n`,{mode:0o700});
  const repository=await resolveRepository(cwd);await openStore(repository);
  const binding=await bindRemote(repository,{repositoryId,declaredUrl:f.remote,target:'origin'});if(binding.status!=='bound')throw Error('fixture');
  const options={repository,binding,signal:AbortSignal.timeout(10000),deadline:Date.now()+10000};
  const automatic=await DataTransport.open({...options,operationMode:'automatic'});
  let commit:string;
  try{
    expect(await automatic.remoteTip()).toBeNull();
    commit=await automatic.commit(renderArtifacts(reduceLedger([],meta),meta,defaultCatalog),null);
    await expect(automatic.push(commit,null)).rejects.toThrow('automatic-local-transport');
    await expect(access(marker)).rejects.toMatchObject({code:'ENOENT'});
    expect(await automatic.remoteTip()).toBeNull();
  }finally{await automatic.close();}
  const manual=await DataTransport.open({...options,operationMode:'manual'});
  try{await manual.push(commit!,null);expect(await manual.remoteTip()).toBe(commit!);await access(marker);}finally{await manual.close();}
});
test('validates independent routing evidence concurrently before remote access',async()=>{
  const f=await fixture(),t=await transport(f),actual=processPort.runGit;let active=0,maximum=0;
  const calls=vi.spyOn(processPort,'runGit').mockImplementation(async(args,options)=>{active++;maximum=Math.max(maximum,active);try{return await actual(args,options);}finally{active--;}});
  try{expect(await t.remoteTip()).toBeNull();expect(maximum).toBeGreaterThan(2);expect(calls.mock.calls.some(([args])=>args.includes('--get-url'))).toBe(true);}
  finally{calls.mockRestore();await t.close();}
});
test('opening verifies the route once and read-only remote checks create no transaction ref to delete',async()=>{
  const f=await fixture(),repository=await resolveRepository(f.clones[0]);await openStore(repository);
  const binding=await bindRemote(repository,{repositoryId,declaredUrl:f.remote,target:'origin'});if(binding.status!=='bound')throw Error('fixture');
  const calls=vi.spyOn(processPort,'runGit'),t=await DataTransport.open({repository,binding,signal:AbortSignal.timeout(10000),deadline:Date.now()+10000});
  expect(calls.mock.calls.filter(([args])=>args[0]==='remote'&&args.includes('get-url'))).toHaveLength(2);
  await t.remoteTip();await t.close();expect(calls.mock.calls.filter(([args])=>args.includes('update-ref'))).toHaveLength(0);
});
test('reads a valid immutable tree using bounded batch object I/O', async () => {
  const f=await fixture(),commit=await commitFixtureTree(f,f.remote,entries());
  await f.git(f.remote,['update-ref','refs/heads/agent-badge/data',commit]);
  const t=await transport(f),calls=vi.spyOn(processPort,'runGit');
  try {
    const accepted=await t.fetch();expect(accepted.commit).toBe(commit);expect(accepted.ledger.recordedUnits).toBe(0);
    const reads=calls.mock.calls.filter(([args])=>args.includes('cat-file')&& !args.includes('-t'));
    expect(reads).toHaveLength(1);
    expect(reads[0][1].maxOutputBytes).toBeLessThanOrEqual(9*1024*1024);
  } finally {await t.close();}
});
test('automatic cache loss stages a large immutable snapshot across fresh transports without early accepted anchors',async()=>{
  const f=await fixture(),repository=await resolveRepository(f.clones[0]),store=await openStore(repository);
  const binding=await bindRemote(repository,{repositoryId,declaredUrl:f.remote,target:'origin'});if(binding.status!=='bound')throw Error('fixture');
  const records=Array.from({length:1100},(_,i)=>sanitizeObservation({...protocolObservationFixture(),nativeUnitId:'large-stage-'+i,nativeCoverageId:'coverage-'+i},meta.policy));
  const artifacts=renderArtifacts(reduceLedger(records,meta),meta,defaultCatalog),writer=await transport(f);
  let commit:string;
  try{commit=await writer.commit(artifacts,null);await writer.push(commit,null);}finally{await writer.close();}
  let snapshot,deferrals=0;
  for(let n=0;n<30&&!snapshot;n++){
    const signal=AbortSignal.timeout(2000),deadline=Date.now()+2000;
    await store.withLock(signal,async()=>{
      const t=await DataTransport.open({repository,binding,indexMode:'lazy',signal,deadline});
      try{snapshot=await t.fetch();expect(snapshot.artifacts).toEqual(artifacts);}
      catch(error){expect(String(error)).toContain('unavailable');deferrals++;expect(await AcceptedIndex.load(repository.privateDir,commit)).toBeNull();}
      finally{await t.closeCache();await t.close();}
    });
  }
  expect(deferrals).toBeGreaterThan(0);expect(snapshot).toBeDefined();
  expect(await f.git(repository.worktreeRoot,['for-each-ref','--format=%(refname)','refs/agent-badge/accepted'])).toBe('');
},30000);
test('writes cold blobs in batches and reuses unchanged parent objects', async () => {
  const f=await fixture(),t=await transport(f),artifacts=renderArtifacts(reduceLedger([],meta),meta,defaultCatalog);
  const calls=vi.spyOn(processPort,'runGit');
  try {
    const parent=await t.commit(artifacts,null);
    expect(calls.mock.calls.filter(([args])=>args.includes('hash-object'))).toHaveLength(1);
    calls.mockClear();
    const repeated=await t.commit(artifacts,parent);
    expect(calls.mock.calls.filter(([args])=>args.includes('hash-object'))).toHaveLength(0);
    expect(await f.git(f.clones[0],['rev-parse',`${repeated}^{tree}`])).toBe(await f.git(f.clones[0],['rev-parse',`${parent}^{tree}`]));
  } finally {await t.close();}
});
test('a fetched Git submodule entry cannot masquerade as a public data file',async()=>{
  const f=await fixture(),cwd=f.clones[0],head=(await f.git(cwd,['rev-parse','HEAD'])).trim();
  const tree=(await f.git(cwd,['mktree'],`160000 commit ${head}\tmeta.json\n`)).trim(),commit=(await f.git(cwd,['commit-tree',tree,'-m','Synthetic hostile data tree'])).trim();
  await f.git(cwd,['-c','core.hooksPath=/dev/null','push',f.remote,`${commit}:refs/heads/agent-badge/data`]);
  const t=await transport(f);try{await expect(t.fetch()).rejects.toThrow();}finally{await t.close();}
});
test('canonical artifact writes never execute user attribute clean filters', async () => {
  const f=await fixture(),t=await transport(f),cwd=f.clones[0],marker=join(cwd,'filter-ran');
  await writeFile(join(cwd,'.gitattributes'),'* filter=synthetic\n');
  await f.git(cwd,['config','filter.synthetic.clean',`touch '${marker}'; cat`]);
  await f.git(cwd,['config','filter.synthetic.required','true']);
  try {
    const artifacts=renderArtifacts(reduceLedger([],meta),meta,defaultCatalog),commit=await t.commit(artifacts,null);
    await expect(access(marker)).rejects.toThrow();
    expect(await f.git(cwd,['show',`${commit}:summary.json`])).toBe(Buffer.from(artifacts.get('summary.json')!).toString());
  } finally {await t.close();}
});
test.each([
  [
    "unsafe path",
    () => [...entries(), { path: "private.txt", content: "synthetic" }],
  ],
  [
    "symlink",
    () =>
      entries().map((e) =>
        e.path === "README.md" ? { ...e, mode: "120000" } : e
      ),
  ],
  [
    "oversized blob",
    () =>
      entries().map((e) =>
        e.path === "README.md"
          ? { ...e, content: "x".repeat(256 * 1024 + 1) }
          : e
      ),
  ],
  [
    "future protocol",
    () =>
      entries().map((e) =>
        e.path === "meta.json"
          ? {
              ...e,
              content: e.content.replace(
                '"protocolVersion":1',
                '"protocolVersion":2'
              ),
            }
          : e
      ),
  ],
  [
    "incompatible catalog",
    () =>
      entries().map((e) =>
        e.path === "catalog.json"
          ? { ...e, content: e.content.replace('"version":1', '"version":2') }
          : e
      ),
  ],
] as const)(
  "rejects %s before accepting a remote tree",
  async (_name, build) => {
    const f = await fixture();
    const commit = await commitFixtureTree(f, f.remote, build());
    await f.git(f.remote, [
      "update-ref",
      "refs/heads/agent-badge/data",
      commit,
    ]);
    const t = await transport(f);
    try {
      await expect(t.fetch()).rejects.toThrow();
    } finally {
      await t.close();
    }
  }
);
test("actual fetched tree ignores user replacement refs without deleting them", async () => {
  const f = await fixture();
  const actual = await commitFixtureTree(f, f.remote, [
    ...entries(),
    { path: "unsafe.txt", content: "synthetic" },
  ]);
  await f.git(f.remote, ["update-ref", "refs/heads/agent-badge/data", actual]);
  const safe = await commitFixtureTree(f, f.clones[0], entries());
  await f.git(f.clones[0], [
    "fetch",
    "--no-write-fetch-head",
    f.remote,
    "refs/heads/agent-badge/data",
  ]);
  await f.git(f.clones[0], ["replace", actual, safe]);
  const before = await f.git(f.clones[0], ["for-each-ref", "refs/replace"]);
  const t = await transport(f);
  try {
    await expect(t.fetch()).rejects.toThrow();
  } finally {
    await t.close();
  }
  expect(await f.git(f.clones[0], ["for-each-ref", "refs/replace"])).toBe(
    before
  );
});
test("literal push refuses pushInsteadOf even when named explicit pushurl suppresses it", async () => {
  const f = await fixture(),
    other = await fixture();
  await f.git(f.clones[0], ["remote", "set-url", "--push", "origin", f.remote]);
  await f.git(f.clones[0], [
    "config",
    `url.${other.remote}.pushInsteadOf`,
    f.remote,
  ]);
  expect(
    (await f.git(f.clones[0], ["remote", "get-url", "--push", "origin"])).trim()
  ).toBe(f.remote);
  await expect(transport(f)).rejects.toThrow("routing-changed");
  expect(
    await other.git(other.remote, [
      "for-each-ref",
      "refs/heads/agent-badge/data",
    ])
  ).toBe("");
});
test("literal fetch refuses a second insteadOf expansion", async () => {
  const f = await fixture(),
    other = await fixture();
  const alias = "synthetic-route:";
  await f.git(f.clones[0], ["remote", "set-url", "origin", alias]);
  await f.git(f.clones[0], ["config", `url.${f.remote}.insteadOf`, alias]);
  await f.git(f.clones[0], [
    "config",
    `url.${other.remote}.insteadOf`,
    f.remote,
  ]);
  expect(
    (await f.git(f.clones[0], ["remote", "get-url", "--push", "origin"])).trim()
  ).toBe(f.remote);
  await expect(transport(f)).rejects.toThrow("routing-changed");
});

test("relative local destination is pinned absolutely rather than interpreted as another remote name", async () => {
  const f = await fixture(),
    other = await fixture();
  const local = "local-route";
  await f.git(f.clones[0], ["init", "--bare", local]);
  await f.git(f.clones[0], ["remote", "add", local, other.remote]);
  await f.git(f.clones[0], ["remote", "set-url", "origin", local]);
  const t = await transport(f);
  try {
    const commit = await t.commit(
      renderArtifacts(reduceLedger([], meta), meta, defaultCatalog),
      null
    );
    await t.push(commit, null);
    expect((await t.fetch()).commit).toBe(commit);
  } finally {
    await t.close();
  }
  expect(
    await other.git(other.remote, [
      "for-each-ref",
      "refs/heads/agent-badge/data",
    ])
  ).toBe("");
});

test("duplicate disjoint directories cannot disguise a noncanonical tree", async () => {
  const f = await fixture();
  const controls = [1, 2].map((n) => ({
    schemaVersion: 2 as const,
    normalizationVersion: 1 as const,
    repositoryId,
    kind: "exclude" as const,
    targetUnitKey: String(n).repeat(64),
    supersedes: [],
  }));
  const artifacts = renderArtifacts(
    reduceLedger(controls, meta),
    meta,
    defaultCatalog
  );
  const commit = await commitFixtureTree(
    f,
    f.remote,
    [...artifacts].map(([path, bytes]) => ({
      path,
      content: Buffer.from(bytes).toString("utf8"),
    }))
  );
  const rootLines = (await f.git(f.remote, ["ls-tree", commit]))
    .trim()
    .split("\n");
  const controlLine = rootLines.find((line) => line.endsWith("\tcontrols"))!;
  const controlTree = controlLine.split(" ")[2].split("\t")[0];
  const shards = (await f.git(f.remote, ["ls-tree", controlTree]))
    .trim()
    .split("\n");
  expect(shards).toHaveLength(2);
  const halves = await Promise.all(
    shards.map((line) =>
      f.git(f.remote, ["mktree"], line + "\n").then((s) => s.trim())
    )
  );
  const lines = [
    ...rootLines.filter((line) => !line.endsWith("\tcontrols")),
    ...halves.map((oid) => `040000 tree ${oid}\tcontrols`),
  ];
  const raw = Buffer.concat(
    lines
      .sort((a, b) => a.split("\t")[1].localeCompare(b.split("\t")[1]))
      .map((line) => {
        const [left, name] = line.split("\t");
        const [mode, , oid] = left.split(" ");
        return Buffer.concat([
          Buffer.from(`${mode.replace(/^0/, "")} ${name}\0`),
          Buffer.from(oid, "hex"),
        ]);
      })
  );
  const { runGit } = await import("./process.js");
  const object = await runGit(
    ["hash-object", "-w", "--literally", "-t", "tree", "--stdin"],
    { cwd: f.remote, input: raw }
  );
  expect(object.status).toBe("ok");
  const malformed = (
    await f.git(f.remote, [
      "commit-tree",
      object.stdout.trim(),
      "-m",
      "Synthetic duplicate tree",
    ])
  ).trim();
  await f.git(f.remote, [
    "update-ref",
    "refs/heads/agent-badge/data",
    malformed,
  ]);
  const t = await transport(f);
  try {
    await expect(t.fetch()).rejects.toThrow();
  } finally {
    await t.close();
  }
});

test('automatic publication uses an independently owned loopback receiver', async () => {
  const f = await fixture(), daemon = await startFixtureGitDaemon(f), repository = await resolveRepository(f.clones[0]);
  try {
    await f.git(f.clones[0], ['remote', 'set-url', 'origin', daemon.url]);
    await openStore(repository);
    const binding = await bindRemote(repository, { repositoryId, declaredUrl: 'https://github.com/synthetic/fixture', target: 'origin' });
    if (binding.status !== 'bound') throw Error('fixture');
    const transport = await DataTransport.open({ repository, binding, operationMode: 'automatic', signal: AbortSignal.timeout(10000), deadline: Date.now() + 10000 });
    try {
      const commit = await transport.commit(renderArtifacts(reduceLedger([], meta), meta, defaultCatalog), null);
      await transport.push(commit, null);
      expect(await transport.remoteTip()).toBe(commit);
      expect((await transport.fetch())?.commit).toBe(commit);
    } finally { await transport.close(); }
  } finally { await daemon.stop(); }
});
