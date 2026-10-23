import { it, expect } from 'vitest';
import { assertWindowsManualSetup } from './windows-setup-result.mjs';
const actions = ['Windows automatic hooks are unsupported; use manual sync.', 'Provider hooks require Node 24 or 26 on provider PATH and explicit native project trust/hook review; restart the provider after review.'];
const payload = { schemaVersion:1, command:'init', status:'action-required', exitCode:1, hooks:'action-required', providerHooks:'configured-needs-trust', queuedRecords:0, pendingReconciliation:false, actionItems:actions };
it('Windows manual smoke accepts only the disclosed automatic-hook limitation in JSON and plaintext', () => {
  expect(() => assertWindowsManualSetup({code:1,stdout:'npm output\n'+JSON.stringify(payload)}, 'init', 'json')).not.toThrow();
  const stdout = 'agent-badge: setup action-required.\n  Git hooks: action-required; provider hooks: configured-needs-trust\n  0 queued records.\n  Reconciliation pending: no\n' + actions.map(a=>'  Action: '+a).join('\n');
  expect(() => assertWindowsManualSetup({code:1,stdout}, 'setup', 'plaintext')).not.toThrow();
});
it('Windows manual smoke refuses unrelated provider/setup actions rather than accepting arbitrary exit1', () => {
  expect(() => assertWindowsManualSetup({code:1,stdout:JSON.stringify({...payload,actionItems:[...actions,'codex owned Stop hook changed; reconcile it before setup.']})}, 'init', 'json')).toThrow();
  expect(() => assertWindowsManualSetup({code:1,stdout:'agent-badge: setup unavailable; explicit setup may be required.'}, 'setup', 'plaintext')).toThrow();
});
it('Windows manual smoke refuses unresolved usage or an unexpected process status', () => {
  expect(() => assertWindowsManualSetup({code:1,stdout:JSON.stringify({...payload,pendingReconciliation:true})}, 'init', 'json')).toThrow();
  expect(() => assertWindowsManualSetup({code:0,stdout:JSON.stringify(payload)}, 'init', 'json')).toThrow();
});
