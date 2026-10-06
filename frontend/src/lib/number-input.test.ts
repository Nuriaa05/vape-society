import { describe, expect, it } from "vitest";

import {
  normalizeNumberInputValue,
  reconcileNumberInputValue,
} from "@/lib/number-input";

describe("number input editing", () => {
  it.each([
    ["014", "14"],
    ["00014", "14"],
    ["000", "0"],
    ["-014", "-14"],
    ["00.5", "0.5"],
    ["0.5", "0.5"],
    ["-0.5", "-0.5"],
    ["1.", "1."],
    ["", ""],
  ])("formats %j as %j without losing decimal entry", (typed, expected) => {
    expect(normalizeNumberInputValue(typed)).toBe(expected);
  });

  it("keeps the field empty while its numeric value is zero", () => {
    expect(reconcileNumberInputValue("", "0")).toBe("");
  });

  it("preserves a decimal separator and trailing zeros while typing", () => {
    expect(reconcileNumberInputValue("1.", "1")).toBe("1.");
    expect(reconcileNumberInputValue("0.50", "0.5")).toBe("0.50");
  });

  it("shows a new value when a price calculation or quantity button changes it", () => {
    expect(reconcileNumberInputValue("45", "100")).toBe("100");
    expect(reconcileNumberInputValue("14", "15")).toBe("15");
    expect(reconcileNumberInputValue("", "5")).toBe("5");
  });

  it("allows a form to explicitly reset a string value to empty", () => {
    expect(reconcileNumberInputValue("0", "")).toBe("");
  });
});
