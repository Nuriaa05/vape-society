import { describe, expect, it } from "vitest";

import {
  normalizeInterfaceScale,
  parseStoredInterfaceScale,
} from "./interface-scale";

describe("interface scale preference", () => {
  it("restores the saved percentage", () => {
    expect(parseStoredInterfaceScale("75")).toBe(75);
    expect(parseStoredInterfaceScale("125")).toBe(125);
  });

  it("uses the normal size when the preference is missing or invalid", () => {
    for (const value of [null, "", " ", "invalid", "NaN", "Infinity"]) {
      expect(parseStoredInterfaceScale(value)).toBe(100);
    }
  });

  it("keeps an out-of-range preference within usable limits", () => {
    expect(parseStoredInterfaceScale("0")).toBe(50);
    expect(parseStoredInterfaceScale("500")).toBe(150);
    expect(normalizeInterfaceScale(45)).toBe(50);
    expect(normalizeInterfaceScale(155)).toBe(150);
  });

  it("keeps scale adjustments on five-percent steps", () => {
    expect(normalizeInterfaceScale(76)).toBe(75);
    expect(normalizeInterfaceScale(123)).toBe(125);
    expect(normalizeInterfaceScale(Number.NaN)).toBe(100);
  });
});
