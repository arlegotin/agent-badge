import { digestSchema, parseProtocol } from "../domain/capabilities.js";
import { parseSharedPolicy } from "../domain/policy.js";
import type { SharedPolicy } from "../domain/policy.js";
import { xmlText } from "./svg.js";

/** Frozen v2.0.0 presentation: accepted unmarked trees validate against these exact bytes. */
export function renderLegacySvg(policyInput: SharedPolicy, value: string, inputSetHash: string): string {
  const digest = parseProtocol(digestSchema, inputSetHash);
  const policy = parseSharedPolicy(policyInput); const label = policy.badge.label;
  const left = Math.max(40, Array.from(label).length * 8 + 16); const right = Math.max(40, Array.from(value).length * 8 + 16);
  const width = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${xmlText(`${label}: ${value}`)}"><title>${xmlText(`${label}: ${value}`)}</title><desc>Input set ${digest}</desc><rect width="${left}" height="20" fill="#555"/><rect x="${left}" width="${right}" height="20" fill="#286b46"/><g fill="#fff" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="11"><text x="${left / 2}" y="14">${xmlText(label)}</text><text x="${left + right / 2}" y="14">${xmlText(value)}</text></g></svg>`;
}
