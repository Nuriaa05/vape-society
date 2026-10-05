import { describe, expect, it } from "vitest";

import { formatAmountCentsAsARS, parsePesosToAmountCents } from "./money";

describe("frontend money utilities", () => {
  it.each([
    ["2500", 250000],
    ["2500,50", 250050],
    ["2.500,50", 250050],
  ])("parses %s pesos input into amountCents", (input, expected) => {
    expect(parsePesosToAmountCents(input)).toBe(expected);
  });

  it.each([
    [250000, "$2.500"],
    [250050, "$2.500,50"],
  ])("formats %i amountCents as visible ARS", (input, expected) => {
    expect(formatAmountCentsAsARS(input)).toBe(expected);
  });
});
