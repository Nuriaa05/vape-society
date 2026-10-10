import { describe, expect, it } from "vitest";

import {
  createEmptyPurchaseDraft,
  discardPurchaseDraft,
  formatPurchaseCostInput,
} from "./purchase-draft";
import { parsePesosToAmountCents } from "./money";

describe("purchase draft helpers", () => {
  it("starts purchases with an empty draft instead of preloading demo items", () => {
    expect(createEmptyPurchaseDraft()).toEqual({ supplierId: "", items: [] });
  });

  it("discarding a purchase draft leaves it empty", () => {
    expect(discardPurchaseDraft()).toEqual({ supplierId: "", items: [] });
  });

  it.each([
    [1250.25, "1250,25", 125025],
    [1250.1, "1250,1", 125010],
    [1250.01, "1250,01", 125001],
    [1250, "1250", 125000],
    [0.25, "0,25", 25],
    [0.01, "0,01", 1],
    [0, "0", 0],
  ])(
    "preserves the cost %s when loading and reading a purchase form",
    (cost, expectedInput, expectedAmountCents) => {
      const input = formatPurchaseCostInput(cost);

      expect(input).toBe(expectedInput);
      expect(parsePesosToAmountCents(input)).toBe(expectedAmountCents);
    },
  );
});
