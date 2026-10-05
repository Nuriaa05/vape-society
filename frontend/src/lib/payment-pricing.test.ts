import { describe, expect, it } from "vitest";

import {
  basisPointsToPercentInput,
  percentInputToBasisPoints,
} from "./payment-pricing";

describe("payment pricing", () => {
  it("formats basis points as a localized percentage input", () => {
    expect(basisPointsToPercentInput(250)).toBe("2,5");
    expect(basisPointsToPercentInput(0)).toBe("0");
    expect(basisPointsToPercentInput(125)).toBe("1,25");
  });

  it("parses localized percentages into basis points", () => {
    expect(percentInputToBasisPoints("2,5")).toBe(250);
    expect(percentInputToBasisPoints(" 1,25 ")).toBe(125);
    expect(percentInputToBasisPoints("0")).toBe(0);
  });

  it("rejects invalid percentage inputs", () => {
    expect(() => percentInputToBasisPoints("")).toThrow();
    expect(() => percentInputToBasisPoints("100,01")).toThrow();
    expect(() => percentInputToBasisPoints("2,555")).toThrow();
  });
});
