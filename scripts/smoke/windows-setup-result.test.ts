import { it, expect } from 'vitest';
import { assertWindowsUnsupportedPlatform } from './windows-setup-result.mjs';
const message = 'agent-badge: Native Windows is unsupported. Run Agent Badge and the coding agent in Linux/WSL2, or use macOS.';
const payload = { schemaVersion:1, command:'init', status:'unsupported-platform', message, exitCode:3 };
it('Windows smoke accepts only the finite platform rejection in JSON and plaintext', () => {
  expect(() => assertWindowsUnsupportedPlatform({code:3,stdout:'npm output\n'+JSON.stringify(payload)}, 'init', 'json')).not.toThrow();
  expect(() => assertWindowsUnsupportedPlatform({code:3,stdout:'',stderr:message+'\n'}, 'setup', 'plaintext')).not.toThrow();
});
it('Windows smoke refuses arbitrary setup failure, changed guidance and fabricated usage', () => {
  for(const value of [{...payload,status:'operation-unavailable'}, {...payload,message:'unexpected secret'}, {...payload,queuedRecords:0}, {...payload,actualWorker:{node:'24'}}])
    expect(() => assertWindowsUnsupportedPlatform({code:3,stdout:JSON.stringify(value)}, 'init', 'json')).toThrow();
  expect(() => assertWindowsUnsupportedPlatform({code:1,stdout:JSON.stringify(payload)}, 'init', 'json')).toThrow();
  expect(() => assertWindowsUnsupportedPlatform({code:1,stderr:'agent-badge: setup unavailable; explicit setup may be required.',stdout:''}, 'setup', 'plaintext')).toThrow();
});
