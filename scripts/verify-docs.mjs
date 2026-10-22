import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { buildProgram } from '../packages/agent-badge/src/cli/main.ts';
import { codexCapabilityManifest } from '../packages/core/src/providers/codex/adapter.ts';
import { claudeCapabilityManifest } from '../packages/core/src/providers/claude/adapter.ts';
import { geminiCapabilityManifest } from '../packages/core/src/providers/gemini/adapter.ts';
import { opencodeCapabilityManifest } from '../packages/core/src/providers/opencode/adapter.ts';
import { normalizedImportCapabilityManifest } from '../packages/core/src/providers/normalized-import.ts';
const files=['README.md','SECURITY.md','docs/INSTALL.md','docs/QUICKSTART.md','docs/CLI.md','docs/CONFIGURATION.md','docs/AUTH.md','docs/ATTRIBUTION.md','docs/PRIVACY.md','docs/UNINSTALL.md','docs/FAQ.md','docs/TROUBLESHOOTING.md','docs/HOW-IT-WORKS.md','docs/RECOVERY.md','docs/MANUAL-GIST.md'];
const errors=[];let examples=0,links=0;
for(const file of files){
 const source=await readFile(file,'utf8');
 for(const match of source.matchAll(/\]\(([^)]+)\)/g)){
  const href=match[1].split(/\s+"/)[0].replace(/^<|>$/g,'');if(/^[a-z]+:/i.test(href)||href.startsWith('#'))continue;
  const path=decodeURIComponent(href.split('#')[0]);if(!path)continue;
  try{await stat(resolve(dirname(file),path));links++;}catch{errors.push(`${file}: missing local link ${path}`);}
 }
 let fence=false;
 for(const line of source.split('\n')){
  if(line.startsWith('```')){fence=!fence;continue;}if(!fence)continue;
  const command=line.trim().replace(/^node \.agent-badge\/run\.cjs\b/,'agent-badge');if(!command.startsWith('agent-badge '))continue;
  const tokens=command.match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^\s]+/g).map(token=>token.replace(/^(['"])(.*)\1$/,'$2')).slice(1);
  const sentinel=new Error('validated-command');const program=buildProgram().exitOverride().hook('preAction',()=>{throw sentinel;});
  for(const child of [program,...program.commands])child.configureOutput({writeOut:()=>{},writeErr:()=>{}});
  try{await program.parseAsync(tokens,{from:'user'});errors.push(`${file}: command executed during validation`);}
  catch(error){if(error!==sentinel&&!['commander.helpDisplayed','commander.version'].includes(error.code))errors.push(`${file}: invalid CLI example ${tokens[0]} (${error.code??'invalid'})`);}
  examples++;
 }
}
const cli=await readFile('docs/CLI.md','utf8'),documented=[...cli.matchAll(/^\| `([a-z]+)` \|/gm)].map(m=>m[1]).sort(),actual=buildProgram().commands.map(c=>c.name()).sort();
if(JSON.stringify(documented)!==JSON.stringify(actual))errors.push('docs/CLI.md: command table differs from actual CLI');
const attribution=await readFile('docs/ATTRIBUTION.md','utf8'),rows=new Map([...attribution.matchAll(/^\| (\w+) \| (fixture-certified|unsupported) \|/gm)].map(m=>[m[1],m[2]]));
const manifests=[codexCapabilityManifest,claudeCapabilityManifest,geminiCapabilityManifest,opencodeCapabilityManifest,normalizedImportCapabilityManifest,{provider:'cursor',accounting:'unsupported'},{provider:'copilot',accounting:'unsupported'}];
for(const manifest of manifests)if(rows.get(manifest.provider)!==manifest.accounting)errors.push(`docs/ATTRIBUTION.md: ${manifest.provider} reader maximum differs from manifest`);
for(const file of files){const source=await readFile(file,'utf8');if(/gist\.githubusercontent\.com|img\.shields\.io\/endpoint/.test(source))errors.push(`${file}: obsolete live Gist/image endpoint`);}
if(errors.length){for(const error of errors)console.error(error);process.exitCode=1;}else console.log(`Documentation verification passed: ${files.length} documents, ${links} local links, ${examples} CLI examples, ${actual.length} commands, ${manifests.length} capabilities.`);
