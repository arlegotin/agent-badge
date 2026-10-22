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

export function codexContext(turn = 'turn-1', model = 'gpt-5.4-mini') {
  return {timestamp:'2026-10-22T00:00:00.000Z',ordinal:1,type:'turn_context',payload:{turn_id:turn,cwd:'/synthetic/repo',model}};
}
export function codexRequest(thread = 'original', turn = 'turn-1', response = 'response-1', input = 100, ordinal = 2) {
  const usage = {input_tokens:input,cached_input_tokens:20,cache_write_input_tokens:0,output_tokens:input/10,reasoning_output_tokens:3,total_tokens:input+input/10};
  return {timestamp:'2026-10-22T00:00:01.000Z',ordinal,type:'token_usage_record',payload:{thread_id:thread,turn_id:turn,session_id:'synthetic-session',root_turn_id:turn,response_id:response,usage,turn_token_usage:usage,thread_token_usage:usage}};
}
export function codexRollout(options: {owner?: Record<string,unknown>; child?:boolean; single?:boolean} = {}): string {
  const owner = options.owner ?? {id:'original'};
  const first = codexRequest();
  const lines: unknown[] = [{timestamp:'2026-10-22T00:00:00.000Z',ordinal:0,type:'session_meta',payload:{...owner,cli_version:'synthetic-source-pin'}},codexContext(),first,
    {type:'event_msg',payload:{type:'token_count',info:{last_token_usage:first.payload.usage,total_token_usage:first.payload.usage}}},
    {type:'compacted',payload:{latest_token_usage_record:first.payload}}];
  if(!options.single) lines.push({...codexContext('turn-2','gpt-4.1-mini'),ordinal:3},codexRequest('original','turn-2','response-2',200,4));
  if(options.child) lines.push({...codexContext('turn-child'),ordinal:5},codexRequest(String(owner.id),'turn-child','response-child',300,6));
  return lines.map(line => JSON.stringify(line)).join('\n')+'\n';
}
