import { ProtocolError } from "../domain/capabilities.js";
import type { ControlRecord, PublicRecord } from "../domain/ledger.js";
import type { PublicObservation } from "../domain/usage.js";
export const isObservation = (record: PublicRecord): record is PublicObservation => !("kind" in record);
function sameIdentity(a: PublicObservation, b: PublicObservation): boolean {
  return a.unitKey === b.unitKey && a.coverageKey === b.coverageKey && a.provider === b.provider &&
    a.representation === b.representation && a.repositoryId === b.repositoryId;
}
export interface ControlState { excluded: Set<string>; conflicting: Set<string>; withdrawn: Set<string> }
/** Validate the complete causal closure before removing any evidence from accounting. */
export function resolveControls(records: ReadonlyMap<string, PublicRecord>): ControlState {
  const controls: [string, ControlRecord][] = []; const supersededControls = new Set<string>();
  const withdrawn = new Set<string>(); const replaced = new Set<string>(); const replacements = new Set<string>();
  for (const [hash, record] of records) {
    if (isObservation(record)) {
      for (const priorHash of record.supersedes) {
        const prior = records.get(priorHash);
        if (!prior || !isObservation(prior) || !sameIdentity(record, prior) || priorHash === hash)
          throw new ProtocolError("invalid-record");
        withdrawn.add(priorHash);
      }
      continue;
    }
    controls.push([hash, record]);
    for (const priorHash of record.supersedes) {
      const prior = records.get(priorHash);
      if (!prior || isObservation(prior) || prior.targetUnitKey !== record.targetUnitKey || priorHash === hash)
        throw new ProtocolError("invalid-record");
      supersededControls.add(priorHash);
    }
    if (record.kind !== "correct") continue;
    const oldRecords = record.replacedObservationHashes.map((key) => records.get(key));
    const newRecords = record.replacementObservationHashes.map((key) => records.get(key));
    const all = [...oldRecords, ...newRecords];
    if (all.some((r) => !r || !isObservation(r) || r.unitKey !== record.targetUnitKey) ||
      !all.every((r) => sameIdentity(all[0] as PublicObservation, r as PublicObservation)) ||
      record.replacedObservationHashes.some((key) => record.replacementObservationHashes.includes(key)))
      throw new ProtocolError("invalid-record");
    record.replacedObservationHashes.forEach((key) => replaced.add(key));
    record.replacementObservationHashes.forEach((key) => replacements.add(key));
  }
  // Kahn traversal validates cycles without recursion: long accepted histories must not overflow the stack.
  const incoming = new Map<string, number>(); const dependents = new Map<string, string[]>();
  const ready: string[] = [];
  for (const [hash, record] of records) {
    const parents = new Set(record.supersedes); incoming.set(hash, parents.size);
    if (parents.size === 0) ready.push(hash);
    for (const parent of parents) {
      const children = dependents.get(parent) ?? []; children.push(hash); dependents.set(parent, children);
    }
  }
  let visited = 0;
  while (ready.length > 0) {
    const hash = ready.pop()!; visited++;
    for (const child of dependents.get(hash) ?? []) {
      const remaining = incoming.get(child)! - 1; incoming.set(child, remaining);
      if (remaining === 0) ready.push(child);
    }
  }
  if (visited !== records.size) throw new ProtocolError("invalid-record");
  const active = controls.filter(([hash]) => !supersededControls.has(hash));
  const excluded = new Set<string>(); const conflicting = new Set<string>();
  const corrections = new Map<string, string>(); const selected = new Set<string>();
  for (const [, control] of active) {
    if (control.kind === "exclude") excluded.add(control.targetUnitKey);
    if (control.kind !== "correct") continue;
    const replacement = [...new Set(control.replacementObservationHashes)].sort().join(",");
    const prior = corrections.get(control.targetUnitKey);
    if (prior !== undefined && prior !== replacement) conflicting.add(control.targetUnitKey);
    corrections.set(control.targetUnitKey, replacement);
    control.replacementObservationHashes.forEach((hash) => selected.add(hash));
  }
  for (const hash of replaced) withdrawn.add(hash);
  for (const hash of replacements) if (!selected.has(hash)) withdrawn.add(hash);
  return { excluded, conflicting, withdrawn };
}
