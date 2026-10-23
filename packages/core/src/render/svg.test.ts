import { describe, expect, it } from "vitest";
import { parseSharedPolicy } from "../domain/policy.js";
import { compactInteger, compactMicroUsd, renderSvg } from "./svg.js";
describe("compact presentation", () => {
  it.each([["999", "999"], ["1000", "1K"], ["12345", "12.3K"], ["999499", "999K"],
    ["999949", "1M"], ["999950000", "1B"], ["900719925474099100", "900719925B"]])("formats %s as %s", (value, expected) => {
    expect(compactInteger(value)).toBe(expected);
  });
  it.each([["0", "$0"], ["1234567", "$1.23"], ["1000000000", "$1K"]])("formats microUSD %s as %s", (value, expected) => {
    expect(compactMicroUsd(value)).toBe(expected);
  });
});


describe("SVG input-set hash boundary", () => {
  const repositoryId = "d9428888-122b-4aab-9bc4-111111111111";
  const policy = parseSharedPolicy({ schemaVersion: 1, normalizationVersion: 1, repositoryId,
    discovery: "auto", disabledProviders: [], badge: { label: "AI usage", metric: "tokens" } });
  it.each(["</desc><script>alert(1)</script><desc>", "a".repeat(63), "A".repeat(64)])
    ("rejects malformed or injected input-set hashes %#", (hash) => {
      expect(() => renderSvg(policy, "100 tokens", hash)).toThrow("invalid-record");
    });
  it("preserves a valid digest in the fixed description element", () => {
    const hash = "0123456789abcdef".repeat(4);
    expect(renderSvg(policy, "100 tokens", hash)).toContain(`<desc>Input set ${hash}</desc>`);
  });
});

describe('badge colors', () => {
  const policy = { schemaVersion: 1, normalizationVersion: 1, repositoryId: 'd9428888-122b-4aab-9bc4-111111111111', discovery: 'auto', disabledProviders: [], badge: { label: 'known ~ user label', metric: 'tokens' } } as const;
  const input = { ...policy, disabledProviders: [] };
  const hash = 'a'.repeat(64);
  it('uses gold with dark value text while retaining arbitrary user labels', () => {
    const svg = renderSvg(parseSharedPolicy(input), '86.3M tokens', hash);
    expect(svg).toContain('fill="#E8A515"');
    expect(svg).toContain('<text fill="#222"');
    expect(svg).toContain('known ~ user label: 86.3M tokens');
    expect(parseSharedPolicy(input).badge).not.toHaveProperty('color');
  });
  it.each(['#DC2626', '#2563eb', '#7C3AED', '#DB2777', '#0F766E', '#ffffff', '#000000'])('renders custom %s safely with readable value text', color => {
    const svg = renderSvg(parseSharedPolicy({ ...input, badge: { ...input.badge, color } }), '$38.42', hash);
    expect(svg).toContain(`fill="${color}"`);
    expect(svg).toContain(color === '#ffffff' ? '<text fill="#222"' : '<text fill="#fff"');
  });
  it.each(['red', '#fff', '#12345678', '123456', '#12345g', '#123456" onload="alert(1)', 'url(https://example.test)', '#123456\n'])('rejects unsupported or injected color %j', color => {
    expect(() => renderSvg({ ...input, badge: { ...input.badge, color } } as never, '86.3M tokens', hash)).toThrow('invalid-record');
  });
});
