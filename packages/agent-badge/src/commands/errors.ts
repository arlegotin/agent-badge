export class CommandFailure extends Error {
  constructor(readonly reason: 'needs-setup'|'invalid-input'|'current-ledger-required'|'unknown-local-id'|'operation-unavailable') { super(`agent-badge: ${reason}.`); }
}
