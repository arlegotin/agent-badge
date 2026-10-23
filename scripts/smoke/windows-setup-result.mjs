import assert from 'node:assert/strict';

const actions = [
  'Windows automatic hooks are unsupported; use manual sync.',
  'Provider hooks require Node 24 or 26 on provider PATH and explicit native project trust/hook review; restart the provider after review.',
];

// This accepts one disclosed Windows limitation, never an arbitrary failed setup.
export function assertWindowsManualSetup(result, command, format) {
  assert.equal(result.code, 1);
  const lines = result.stdout.split(/\r?\n/);
  if (format === 'json') {
    const payload = lines.flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } })
      .find(value => value.schemaVersion === 1 && value.command === command);
    assert(payload, 'Missing stable Windows command JSON');
    assert.equal(payload.status, 'action-required'); assert.equal(payload.exitCode, 1);
    assert.equal(payload.hooks, 'action-required'); assert.equal(payload.providerHooks, 'configured-needs-trust');
    assert.equal(payload.queuedRecords, 0); assert.equal(payload.pendingReconciliation, false);
    assert.deepEqual(payload.actionItems, actions);
    return payload;
  }
  assert.equal(command, 'setup'); assert.equal(format, 'plaintext');
  for (const line of ['agent-badge: setup action-required.', '  Git hooks: action-required; provider hooks: configured-needs-trust', '  0 queued records.', '  Reconciliation pending: no']) assert(lines.includes(line), 'Missing Windows setup result: ' + line);
  assert.deepEqual(lines.filter(line => line.startsWith('  Action: ')).map(line => line.slice(10)), actions);
}
