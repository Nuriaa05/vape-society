import { describe, expect, it } from "vitest";
import {
  canShowMore,
  canShowLess,
  getNextVisibleCount,
  getVisibleItems,
} from "./visible-items";

describe("visible items helpers", () => {
  it("returns the first visible items without mutating the source list", () => {
    const items = ["a", "b", "c", "d"];

    expect(getVisibleItems(items, 2)).toEqual(["a", "b"]);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("expands visible count to the full list", () => {
    expect(getNextVisibleCount(10, 10, 24)).toBe(24);
    expect(getNextVisibleCount(20, 10, 24)).toBe(24);
  });

  it("detects when there are more items to reveal", () => {
    expect(canShowMore(5, 6)).toBe(true);
    expect(canShowMore(6, 6)).toBe(false);
    expect(canShowMore(7, 6)).toBe(false);
  });

  it("detects when an expanded list can be collapsed", () => {
    expect(canShowLess(24, 10, 24)).toBe(true);
    expect(canShowLess(10, 10, 24)).toBe(false);
    expect(canShowLess(8, 10, 8)).toBe(false);
  });
});
