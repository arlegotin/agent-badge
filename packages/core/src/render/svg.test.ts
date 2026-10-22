import { describe, expect, it } from "vitest";
import { compactInteger, compactMicroUsd } from "./svg.js";
describe("compact presentation", () => {
  it.each([["999", "999"], ["1000", "1K"], ["12345", "12.3K"], ["999499", "999K"],
    ["999949", "1M"], ["999950000", "1B"], ["900719925474099100", "900719925B"]])("formats %s as %s", (value, expected) => {
    expect(compactInteger(value)).toBe(expected);
  });
  it.each([["0", "$0"], ["1234567", "$1.23"], ["1000000000", "$1K"]])("formats microUSD %s as %s", (value, expected) => {
    expect(compactMicroUsd(value)).toBe(expected);
  });
});
