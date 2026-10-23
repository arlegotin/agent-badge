import { digestSchema, parseProtocol } from "../domain/capabilities.js";
import { parseSharedPolicy } from "../domain/policy.js";
import type { SharedPolicy } from "../domain/policy.js";
/** Fixed SVG structure: only escaped text, validated colors and computed dimensions are interpolated. */
export function xmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
/** Compact integer formatting with BigInt arithmetic and suffix promotion at rounded boundaries. */
export function compactInteger(decimal: string): string {
  const n = BigInt(decimal); const scales = [[1000000000n, "B"], [1000000n, "M"], [1000n, "K"]] as const;
  for (let i = 0; i < scales.length; i++) {
    const [scale, suffix] = scales[i]; if (n < scale) continue;
    if (n >= scale * 100n) {
      const rounded = (n + scale / 2n) / scale;
      if (rounded >= 1000n && i > 0) return compactInteger(scales[i - 1][0].toString());
      return `${rounded}${suffix}`;
    }
    const tenths = (n * 10n + scale / 2n) / scale;
    return `${tenths / 10n}${tenths % 10n === 0n ? "" : `.${tenths % 10n}`}${suffix}`;
  }
  return n.toString();
}
export function compactMicroUsd(decimal: string): string {
  const micro = BigInt(decimal);
  if (micro >= 1000000000n) return `$${compactInteger(((micro + 500000n) / 1000000n).toString())}`;
  const cents = (micro + 5000n) / 10000n;
  return `$${cents / 100n}${cents % 100n === 0n ? "" : `.${(cents % 100n).toString().padStart(2, "0")}`}`;
}
export function renderSvg(policyInput: SharedPolicy, value: string, inputSetHash: string): string {
  const digest = parseProtocol(digestSchema, inputSetHash);
  const policy = parseSharedPolicy(policyInput); const label = policy.badge.label;
  const left = Math.max(40, Array.from(label).length * 8 + 16); const right = Math.max(40, Array.from(value).length * 8 + 16);
  const width = left + right;
  const color = policy.badge.color ?? "#E8A515";
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  // Pick the stronger WCAG contrast against the right panel; the gray label remains white.
  const foreground = (luminance + 0.05) / (0.016 + 0.05) >= 1.05 / (luminance + 0.05) ? "#222" : "#fff";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${xmlText(`${label}: ${value}`)}"><title>${xmlText(`${label}: ${value}`)}</title><desc>Input set ${digest}</desc><rect width="${left}" height="20" fill="#555"/><rect x="${left}" width="${right}" height="20" fill="${color}"/><g fill="#fff" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="11"><text x="${left / 2}" y="14">${xmlText(label)}</text><text fill="${foreground}" x="${left + right / 2}" y="14">${xmlText(value)}</text></g></svg>`;
}
