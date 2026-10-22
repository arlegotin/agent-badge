import { expect, test } from 'vitest';
import { validatePin } from './manifest.js';
const version = '1.1.20';
const manifest = JSON.stringify({ name: 'agent-badge-runtime', private: true, dependencies: { '@legotin/agent-badge': version } });
const entry = { version, resolved: 'https://registry.npmjs.org/@legotin/agent-badge/-/agent-badge-1.1.20.tgz', integrity: 'sha512-c3ludGhldGlj' };
test('every transitive runtime package must have an exact integrity-locked HTTP resolution', () => {
  const lock = { lockfileVersion: 3, packages: { '': { dependencies: { '@legotin/agent-badge': version } }, 'node_modules/@legotin/agent-badge': entry, 'node_modules/untrusted': { version: '1.0.0', resolved: 'https://registry.npmjs.org/untrusted/-/untrusted-1.0.0.tgz' } } };
  expect(() => validatePin({ manifest, lock: JSON.stringify(lock) }, version)).toThrow('Invalid runtime resolution');
});
