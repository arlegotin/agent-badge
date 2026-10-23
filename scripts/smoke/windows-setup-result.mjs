import assert from 'node:assert/strict';
import { UNSUPPORTED_PLATFORM_MESSAGE } from '../../packages/agent-badge/dist/integration/platform.js';

// Classify only the intentional platform boundary, never an arbitrary setup failure.
export function assertWindowsUnsupportedPlatform(result, command, format) {
  assert.equal(result.code, 3);
  if (format === 'json') {
    const payloads = result.stdout.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } })
      .filter(value => value.schemaVersion === 1 && value.command === command);
    assert.equal(payloads.length, 1, 'Missing or ambiguous stable Windows command JSON');
    assert.deepEqual(payloads[0], {schemaVersion:1,command,status:'unsupported-platform',message:UNSUPPORTED_PLATFORM_MESSAGE,exitCode:3});
    return payloads[0];
  }
  assert.equal(format, 'plaintext');
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), UNSUPPORTED_PLATFORM_MESSAGE);
}
